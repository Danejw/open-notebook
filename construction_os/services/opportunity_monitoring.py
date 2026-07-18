"""Durable opportunity monitoring, refresh, and change-history services."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx
from loguru import logger

from construction_os.database.repository import repo_query
from construction_os.domain.opportunity import (
    Opportunity,
    OpportunityChange,
    OpportunityChangeSeverity,
    OpportunityRefreshTrigger,
)
from construction_os.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)
from construction_os.services.opportunities import get_opportunity, upsert_opportunity
from construction_os.services.opportunity_collectors import (
    SAM_OPPORTUNITIES_URL,
    normalize_sam_opportunity,
)
from construction_os.services.project_artifacts import create_project_artifact

MONITORED_STATUSES = {"watching", "pursuing", "submitted"}
TERMINAL_STATUSES = {"won", "lost", "no_bid", "ignored"}

WATCH_FIELDS = (
    "title",
    "agency",
    "solicitation_number",
    "procurement_type",
    "source_status",
    "source_status_reason",
    "location",
    "scope_summary",
    "description",
    "questions_due_at",
    "prebid_at",
    "bid_due_at",
    "source_updated_at",
    "estimated_value_min",
    "estimated_value_max",
    "bid_bond_required",
    "bid_bond_percent",
    "prevailing_wage_required",
    "mandatory_site_visit",
    "contact_name",
    "contact_email",
    "contact_phone",
    "source_url",
    "documents",
    "addenda",
)

CRITICAL_FIELDS = {
    "source_status",
    "bid_due_at",
    "scope_summary",
    "description",
    "bid_bond_required",
    "bid_bond_percent",
    "mandatory_site_visit",
}
IMPORTANT_FIELDS = {
    "questions_due_at",
    "prebid_at",
    "documents",
    "addenda",
    "estimated_value_min",
    "estimated_value_max",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _minutes_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        logger.warning(f"Ignoring invalid {name}={raw!r}; using {default}")
        return default


def monitoring_interval(opportunity: Opportunity, now: Optional[datetime] = None) -> timedelta:
    """Return the next-check interval using workflow state and deadline urgency."""

    now = now or utcnow()
    if opportunity.bid_due_at:
        due = opportunity.bid_due_at
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if now <= due <= now + timedelta(hours=72):
            return timedelta(
                minutes=_minutes_env("OPPORTUNITY_MONITOR_URGENT_MINUTES", 120)
            )

    if opportunity.status == "pursuing":
        return timedelta(
            minutes=_minutes_env("OPPORTUNITY_MONITOR_PURSUING_MINUTES", 360)
        )
    if opportunity.status == "submitted":
        return timedelta(
            minutes=_minutes_env("OPPORTUNITY_MONITOR_SUBMITTED_MINUTES", 1440)
        )
    return timedelta(
        minutes=_minutes_env("OPPORTUNITY_MONITOR_WATCHING_MINUTES", 1440)
    )


def _json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        parsed = value
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        normalized = [_json_value(item) for item in value]
        if all(isinstance(item, dict) for item in normalized):
            return sorted(normalized, key=lambda item: json.dumps(item, sort_keys=True))
        return normalized
    return value


def normalized_snapshot(data: Dict[str, Any]) -> Dict[str, Any]:
    return {field: _json_value(data.get(field)) for field in WATCH_FIELDS}


def snapshot_hash(data: Dict[str, Any]) -> str:
    encoded = json.dumps(normalized_snapshot(data), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _document_identity(document: Dict[str, Any]) -> str:
    return str(
        document.get("url")
        or document.get("href")
        or document.get("name")
        or document.get("title")
        or json.dumps(_json_value(document), sort_keys=True)
    ).strip()


def _document_delta(
    previous: Iterable[Dict[str, Any]], current: Iterable[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    previous_by_id = {
        _document_identity(document): document
        for document in previous
        if _document_identity(document)
    }
    current_by_id = {
        _document_identity(document): document
        for document in current
        if _document_identity(document)
    }
    added = [current_by_id[key] for key in sorted(current_by_id.keys() - previous_by_id.keys())]
    removed = [
        previous_by_id[key] for key in sorted(previous_by_id.keys() - current_by_id.keys())
    ]
    return added, removed


def detect_opportunity_changes(
    opportunity: Opportunity, normalized: Dict[str, Any]
) -> Dict[str, Any]:
    """Compare only normalized procurement fields so raw payload noise is ignored."""

    changed_fields: Dict[str, Dict[str, Any]] = {}
    current_data = opportunity.model_dump()
    for field in WATCH_FIELDS:
        if field not in normalized:
            continue
        previous = _json_value(current_data.get(field))
        current = _json_value(normalized.get(field))
        if previous != current:
            changed_fields[field] = {"previous": previous, "current": current}

    new_documents, removed_documents = _document_delta(
        opportunity.documents, normalized.get("documents") or []
    )
    changed_names = set(changed_fields)
    severity: OpportunityChangeSeverity = "informational"
    if changed_names & CRITICAL_FIELDS:
        severity = "critical"
    elif changed_names & IMPORTANT_FIELDS:
        severity = "important"

    summary_parts: List[str] = []
    if "source_status" in changed_fields:
        summary_parts.append(
            f"official status changed to {changed_fields['source_status']['current']}"
        )
    if "bid_due_at" in changed_fields:
        summary_parts.append("bid deadline changed")
    if "scope_summary" in changed_fields or "description" in changed_fields:
        summary_parts.append("scope changed")
    if new_documents:
        summary_parts.append(f"{len(new_documents)} new document(s)")
    if "addenda" in changed_fields:
        summary_parts.append("addenda changed")
    remaining = changed_names - {
        "source_status",
        "bid_due_at",
        "scope_summary",
        "description",
        "documents",
        "addenda",
    }
    if remaining:
        summary_parts.append(f"{len(remaining)} other field(s) changed")

    return {
        "changed_fields": changed_fields,
        "new_documents": new_documents,
        "removed_documents": removed_documents,
        "severity": severity,
        "summary": "; ".join(summary_parts) or "Opportunity details changed",
    }


def infer_sam_source_state(record: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """Map SAM.gov lifecycle metadata without changing the internal workflow status."""

    text = " ".join(
        str(record.get(key) or "")
        for key in (
            "active",
            "archiveType",
            "type",
            "title",
            "description",
            "award",
        )
    ).lower()
    if any(token in text for token in ("cancelled", "canceled", "cancellation")):
        return "cancelled", "SAM.gov identifies the notice as cancelled"
    if record.get("award") or record.get("awardNumber"):
        return "awarded", "SAM.gov includes award information"
    if record.get("archiveDate") or "archived" in text:
        return "archived", str(record.get("archiveType") or "SAM.gov notice archived")
    active = record.get("active")
    if active is True or str(active).strip().lower() in {"yes", "true", "active"}:
        return "active", None
    if active is False or str(active).strip().lower() in {"no", "false", "inactive"}:
        return "inactive", "SAM.gov marks the notice inactive"
    return "unknown", None


def _classify_addenda(documents: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    addenda: List[Dict[str, Any]] = []
    for document in documents:
        text = " ".join(
            str(document.get(key) or "")
            for key in ("name", "title", "url", "href")
        ).lower()
        if any(token in text for token in ("addendum", "addenda", "amendment", "amend")):
            addenda.append(document)
    return addenda


async def fetch_sam_opportunity(opportunity: Opportunity) -> Dict[str, Any]:
    api_key = os.getenv("SAM_GOV_API_KEY", "").strip()
    if not api_key:
        raise ConfigurationError(
            "SAM_GOV_API_KEY is required to monitor SAM.gov opportunities"
        )

    params = {
        "api_key": api_key,
        "noticeid": opportunity.external_id,
        "limit": "10",
        "offset": "0",
    }
    try:
        async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
            response = await client.get(SAM_OPPORTUNITIES_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in {401, 403}:
            raise ConfigurationError(
                "SAM.gov rejected the configured API key"
            ) from exc
        raise ExternalServiceError(
            f"SAM.gov opportunity refresh failed: HTTP {exc.response.status_code}"
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise ExternalServiceError(f"SAM.gov opportunity refresh failed: {exc}") from exc

    records = [
        item
        for item in (payload.get("opportunitiesData") or [])
        if isinstance(item, dict)
    ]
    if not records:
        raise NotFoundError(
            "SAM.gov did not return the watched notice. It may be archived, removed, or temporarily unavailable."
        )

    record = next(
        (
            item
            for item in records
            if str(item.get("noticeId") or item.get("noticeID") or "").strip()
            == opportunity.external_id
        ),
        records[0],
    )
    normalized = normalize_sam_opportunity(
        record,
        matched_naics_codes=opportunity.matched_naics_codes,
    )
    source_status, reason = infer_sam_source_state(record)
    normalized.update(
        {
            "source_status": source_status,
            "source_status_reason": reason,
            "matched_naics_codes": opportunity.matched_naics_codes,
            "matched_collection_ids": opportunity.matched_collection_ids,
            "discovery_matches": opportunity.discovery_matches,
        }
    )
    normalized["addenda"] = _classify_addenda(normalized.get("documents") or [])
    return normalized


async def fetch_current_opportunity(opportunity: Opportunity) -> Dict[str, Any]:
    if opportunity.source_key == "sam_gov_hawaii":
        return await fetch_sam_opportunity(opportunity)
    raise InvalidInputError(
        f"Automated monitoring is not available for source {opportunity.source_key!r} yet"
    )


def _change_markdown(opportunity: Opportunity, change: OpportunityChange) -> str:
    field_lines = "\n".join(
        f"- **{field.replace('_', ' ').title()}:** "
        f"{values.get('previous')} → {values.get('current')}"
        for field, values in change.changed_fields.items()
    ) or "- No field-level changes recorded."
    document_lines = "\n".join(
        f"- {document.get('name') or document.get('title') or document.get('url') or 'New document'}"
        for document in change.new_documents
    ) or "- No new documents."
    return f"""# Opportunity Update

**Detected:** {change.detected_at.isoformat()}
**Severity:** {change.severity}
**Official status:** {opportunity.source_status}
**Summary:** {change.summary}

## Changed fields

{field_lines}

## New documents and addenda

{document_lines}

## Current source

{opportunity.source_url}
"""


async def _write_project_change_artifact(
    opportunity: Opportunity, change: OpportunityChange
) -> None:
    if not opportunity.project_id:
        return
    await create_project_artifact(
        content=_change_markdown(opportunity, change),
        project_id=opportunity.project_id,
        title=f"Opportunity Update: {change.detected_at.date().isoformat()}",
        artifact_kind="generated",
        save_idempotency_key=f"opportunity-change:{opportunity.id}:{change.snapshot_hash}",
    )


async def activate_opportunity_monitoring(
    opportunity_id: str,
    *,
    trigger: OpportunityRefreshTrigger = "initial",
    refresh_now: bool = True,
) -> Dict[str, Any]:
    opportunity = await get_opportunity(opportunity_id)
    if opportunity.source_key != "sam_gov_hawaii":
        raise InvalidInputError(
            "This opportunity source does not support automated monitoring yet"
        )
    if opportunity.status not in MONITORED_STATUSES:
        opportunity.status = "watching"
    opportunity.monitoring_enabled = True
    opportunity.monitoring_health = "pending"
    opportunity.monitoring_last_error = None
    opportunity.monitoring_next_check_at = utcnow()
    await opportunity.save()

    if refresh_now:
        return await refresh_opportunity(opportunity.id or opportunity_id, trigger=trigger)
    return {
        "opportunity": opportunity,
        "changed": False,
        "change": None,
    }


async def deactivate_opportunity_monitoring(opportunity_id: str) -> Opportunity:
    opportunity = await get_opportunity(opportunity_id)
    opportunity.monitoring_enabled = False
    opportunity.monitoring_health = "inactive"
    opportunity.monitoring_next_check_at = None
    opportunity.monitoring_lease_until = None
    await opportunity.save()
    return opportunity


async def _record_refresh_failure(opportunity: Opportunity, exc: Exception) -> None:
    now = utcnow()
    opportunity.monitoring_last_checked_at = now
    opportunity.monitoring_consecutive_failures += 1
    opportunity.monitoring_last_error = str(exc)
    opportunity.monitoring_lease_until = None

    if isinstance(exc, ConfigurationError):
        opportunity.monitoring_health = "authentication_required"
    elif isinstance(exc, NotFoundError):
        opportunity.monitoring_health = "source_unavailable"
    elif opportunity.monitoring_consecutive_failures >= 3:
        opportunity.monitoring_health = "failing"
    else:
        opportunity.monitoring_health = "delayed"

    backoff_minutes = min(
        1440,
        15 * (2 ** max(0, opportunity.monitoring_consecutive_failures - 1)),
    )
    opportunity.monitoring_next_check_at = now + timedelta(minutes=backoff_minutes)
    await opportunity.save()


async def refresh_opportunity(
    opportunity_id: str,
    *,
    trigger: OpportunityRefreshTrigger = "manual",
) -> Dict[str, Any]:
    opportunity = await get_opportunity(opportunity_id)
    if opportunity.status not in MONITORED_STATUSES or opportunity.archived:
        opportunity = await deactivate_opportunity_monitoring(opportunity_id)
        return {"opportunity": opportunity, "changed": False, "change": None}

    now = utcnow()
    try:
        normalized = await fetch_current_opportunity(opportunity)
        diff = detect_opportunity_changes(opportunity, normalized)
        current_hash = snapshot_hash(normalized)
        has_changes = bool(diff["changed_fields"])

        refreshed, _ = await upsert_opportunity(normalized)
        refreshed.monitoring_enabled = True
        refreshed.monitoring_health = "healthy"
        refreshed.monitoring_last_checked_at = now
        refreshed.monitoring_last_success_at = now
        refreshed.monitoring_last_error = None
        refreshed.monitoring_consecutive_failures = 0
        refreshed.monitoring_lease_until = None
        refreshed.monitoring_snapshot_hash = current_hash
        refreshed.monitoring_next_check_at = now + monitoring_interval(refreshed, now)

        change: Optional[OpportunityChange] = None
        if has_changes:
            change = OpportunityChange(
                opportunity_id=refreshed.id or opportunity_id,
                detected_at=now,
                trigger=trigger,
                severity=diff["severity"],
                summary=diff["summary"],
                source_updated_at=refreshed.source_updated_at,
                changed_fields=diff["changed_fields"],
                new_documents=diff["new_documents"],
                removed_documents=diff["removed_documents"],
                snapshot_hash=current_hash,
            )
            await change.save()
            refreshed.monitoring_last_changed_at = now
            refreshed.monitoring_unread_changes += 1

        await refreshed.save()
        if change:
            try:
                await _write_project_change_artifact(refreshed, change)
            except Exception as exc:
                logger.error(
                    f"Failed to write project update artifact for {refreshed.id}: {exc}"
                )

        return {"opportunity": refreshed, "changed": has_changes, "change": change}
    except Exception as exc:
        await _record_refresh_failure(opportunity, exc)
        raise


async def list_opportunity_changes(
    opportunity_id: str, *, limit: int = 50
) -> List[OpportunityChange]:
    await get_opportunity(opportunity_id)
    rows = await repo_query(
        "SELECT * FROM opportunity_change WHERE opportunity_id = $opportunity_id ORDER BY detected_at DESC LIMIT $limit",
        {"opportunity_id": opportunity_id, "limit": limit},
    )
    return [OpportunityChange(**row) for row in rows]


async def acknowledge_opportunity_changes(opportunity_id: str) -> Opportunity:
    opportunity = await get_opportunity(opportunity_id)
    await repo_query(
        "UPDATE opportunity_change SET acknowledged = true WHERE opportunity_id = $opportunity_id",
        {"opportunity_id": opportunity_id},
    )
    opportunity.monitoring_unread_changes = 0
    await opportunity.save()
    return opportunity


async def claim_due_opportunities() -> List[Opportunity]:
    """Atomically lease every due monitor so multiple scheduler replicas do not duplicate work."""

    now = utcnow()
    lease_until = now + timedelta(minutes=10)
    rows = await repo_query(
        """
        UPDATE opportunity
        SET monitoring_lease_until = $lease_until, monitoring_health = 'pending'
        WHERE monitoring_enabled = true
          AND monitoring_next_check_at <= $now
          AND (monitoring_lease_until = NONE OR monitoring_lease_until < $now)
        RETURN AFTER
        """,
        {"now": now, "lease_until": lease_until},
    )
    return [Opportunity(**row) for row in rows]


async def run_due_monitors_once() -> Dict[str, int]:
    due = await claim_due_opportunities()
    result = {"claimed": len(due), "refreshed": 0, "changed": 0, "failed": 0}
    for opportunity in due:
        try:
            refresh = await refresh_opportunity(
                opportunity.id or "", trigger="scheduled"
            )
            result["refreshed"] += 1
            if refresh["changed"]:
                result["changed"] += 1
        except Exception as exc:
            result["failed"] += 1
            logger.error(f"Opportunity monitor failed for {opportunity.id}: {exc}")
    return result

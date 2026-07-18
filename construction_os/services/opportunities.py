"""Opportunity Hub application services.

The core stays portal-neutral. Collectors normalize external notices into the
Opportunity shape and submit them through ``upsert_opportunity``.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

FitScoreBand = Literal["high", "medium", "low", "unscored"]
OpportunitySort = Literal["due", "fit_score_desc", "fit_score_asc"]

from loguru import logger

from construction_os.database.repository import repo_query
from construction_os.domain.opportunity import Opportunity, OpportunitySource
from construction_os.domain.project import Project
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.services.project_artifacts import create_project_artifact
from construction_os.services.source_ingest import create_upload_source_and_process

HAWAII_SOURCE_SEEDS: List[Dict[str, Any]] = [
    {
        "key": "hands",
        "name": "Hawaii Awards & Notices Data System (HANDS)",
        "coverage": "Statewide",
        "portal_url": "https://hands.ehawaii.gov/",
        "access_method": "public_page",
        "check_frequency": "daily",
        "description": "Primary statewide public procurement notice search portal.",
        "registration_notes": "Public search is available without registration.",
    },
    {
        "key": "hiepro",
        "name": "Hawaii eProcurement System (HIePRO)",
        "coverage": "State agencies",
        "portal_url": "https://hiepro.ehawaii.gov/",
        "access_method": "authenticated_portal",
        "check_frequency": "daily",
        "description": "Electronic solicitations, amendments, responses, and awards for participating state agencies.",
        "registration_notes": "Vendor registration is recommended for notices and submissions.",
    },
    {
        "key": "dags_public_works",
        "name": "DAGS Public Works Division",
        "coverage": "State-owned buildings and facilities",
        "portal_url": "https://publicworks.hawaii.gov/bidding/",
        "access_method": "public_page",
        "check_frequency": "daily",
        "description": "State public works construction, renovation, repair, plans, specifications, and addenda.",
        "registration_notes": "Document access requirements vary by posting.",
    },
    {
        "key": "honolulu_vss",
        "name": "Honolulu Vendor Self Service",
        "coverage": "Oahu / Honolulu",
        "portal_url": "https://vss.honolulu.gov/",
        "access_method": "authenticated_portal",
        "check_frequency": "daily",
        "description": "City and County of Honolulu vendor notices and smaller procurement opportunities.",
        "registration_notes": "Free vendor account required for full portal functions.",
    },
    {
        "key": "maui_public_purchase",
        "name": "Maui County via Public Purchase",
        "coverage": "Maui, Molokai, and Lanai",
        "portal_url": "https://www.publicpurchase.com/",
        "access_method": "authenticated_portal",
        "check_frequency": "daily",
        "description": "Maui County construction bids, public works, goods, and services.",
        "registration_notes": "Free Public Purchase vendor registration required.",
    },
    {
        "key": "kauai_public_purchase",
        "name": "Kauai County via Public Purchase",
        "coverage": "Kauai",
        "portal_url": "https://www.publicpurchase.com/",
        "access_method": "authenticated_portal",
        "check_frequency": "daily",
        "description": "Kauai County construction, goods, and service solicitations.",
        "registration_notes": "Free Public Purchase vendor registration required.",
    },
    {
        "key": "hawaii_county_opengov",
        "name": "Hawaii County OpenGov Procurement",
        "coverage": "Hawaii Island",
        "portal_url": "https://procurement.opengov.com/portal/hawaiicounty",
        "access_method": "authenticated_portal",
        "check_frequency": "daily",
        "description": "Hawaii County IFBs, RFPs, construction, service solicitations, and addenda.",
        "registration_notes": "Free OpenGov vendor account required for subscriptions and responses.",
    },
    {
        "key": "hpha",
        "name": "Hawaii Public Housing Authority",
        "coverage": "Statewide public housing",
        "portal_url": "https://hpha.hawaii.gov/business-partners/contract-procurement-opportunities",
        "access_method": "public_page",
        "check_frequency": "weekly",
        "description": "Public housing construction, rehabilitation, maintenance, and professional services.",
        "registration_notes": "Hawaii Compliance Express may be required before award.",
    },
    {
        "key": "sam_gov_hawaii",
        "name": "SAM.gov Contract Opportunities — Hawaii",
        "coverage": "Federal and military work throughout Hawaii",
        "portal_url": "https://sam.gov/content/opportunities",
        "access_method": "public_api",
        "check_frequency": "daily",
        "description": "Federal construction, military, civil works, maintenance, A/E, and service opportunities.",
        "registration_notes": "A SAM.gov API key is needed for automated API collection; active entity registration is required to contract.",
    },
]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_token(value: Optional[str]) -> str:
    value = (value or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def build_fingerprint(data: Dict[str, Any]) -> str:
    """Build a stable cross-import identity for deduplication."""

    identity = "|".join(
        [
            normalize_token(data.get("source_key")),
            normalize_token(data.get("external_id")),
            normalize_token(data.get("solicitation_number")),
            normalize_token(data.get("agency")),
            normalize_token(data.get("title")),
        ]
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


async def seed_opportunity_sources() -> List[OpportunitySource]:
    """Idempotently create the official Hawaii source registry."""

    sources: List[OpportunitySource] = []
    for seed in HAWAII_SOURCE_SEEDS:
        existing = await repo_query(
            "SELECT * FROM opportunity_source WHERE key = $key LIMIT 1",
            {"key": seed["key"]},
        )
        if existing:
            source = OpportunitySource(**existing[0])
            for key, value in seed.items():
                setattr(source, key, value)
        else:
            source = OpportunitySource(**seed)
        await source.save()
        sources.append(source)
    return sources


async def list_opportunity_sources(enabled: Optional[bool] = None) -> List[OpportunitySource]:
    sources = await OpportunitySource.get_all(order_by="name asc")
    if enabled is not None:
        sources = [source for source in sources if source.enabled == enabled]
    return sources


def _matches_text(opportunity: Opportunity, query: str) -> bool:
    haystack = " ".join(
        [
            opportunity.title,
            opportunity.agency,
            opportunity.solicitation_number or "",
            opportunity.scope_summary,
            opportunity.description,
            opportunity.location,
            " ".join(opportunity.trades),
            " ".join(opportunity.license_requirements),
        ]
    ).lower()
    return query.lower() in haystack


def _matches_fit_score_band(opportunity: Opportunity, band: FitScoreBand) -> bool:
    score = opportunity.fit_score
    if band == "unscored":
        return score is None
    if score is None:
        return False
    if band == "high":
        return score >= 75
    if band == "medium":
        return 50 <= score <= 74
    if band == "low":
        return score < 50
    raise InvalidInputError(f"Unknown fit_score_band: {band}")


async def list_opportunities(
    *,
    query: Optional[str] = None,
    status: Optional[str] = None,
    source_stage: Optional[str] = None,
    island: Optional[str] = None,
    trade: Optional[str] = None,
    agency: Optional[str] = None,
    source_key: Optional[str] = None,
    due_before: Optional[datetime] = None,
    due_after: Optional[datetime] = None,
    min_fit_score: Optional[int] = None,
    fit_score_band: Optional[FitScoreBand] = None,
    sort: OpportunitySort = "due",
    include_archived: bool = False,
    offset: int = 0,
    limit: int = 100,
) -> Tuple[List[Opportunity], int]:
    """Return a filtered, sorted opportunity inbox."""

    allowed_bands: tuple[FitScoreBand, ...] = ("high", "medium", "low", "unscored")
    allowed_sorts: tuple[OpportunitySort, ...] = ("due", "fit_score_desc", "fit_score_asc")
    if fit_score_band is not None and fit_score_band not in allowed_bands:
        raise InvalidInputError(
            f"fit_score_band must be one of: {', '.join(allowed_bands)}"
        )
    if sort not in allowed_sorts:
        raise InvalidInputError(f"sort must be one of: {', '.join(allowed_sorts)}")

    opportunities = await Opportunity.get_all(order_by="updated desc")

    if not include_archived:
        opportunities = [item for item in opportunities if not item.archived]
    if query:
        opportunities = [item for item in opportunities if _matches_text(item, query)]
    if status:
        opportunities = [item for item in opportunities if item.status == status]
    if source_stage:
        opportunities = [
            item for item in opportunities if item.source_stage == source_stage
        ]
    if island:
        opportunities = [item for item in opportunities if item.island == island]
    if trade:
        needle = trade.lower()
        opportunities = [
            item for item in opportunities if any(needle in value.lower() for value in item.trades)
        ]
    if agency:
        needle = agency.lower()
        opportunities = [item for item in opportunities if needle in item.agency.lower()]
    if source_key:
        opportunities = [item for item in opportunities if item.source_key == source_key]
    if due_before:
        opportunities = [
            item for item in opportunities if item.bid_due_at and item.bid_due_at <= due_before
        ]
    if due_after:
        opportunities = [
            item for item in opportunities if item.bid_due_at and item.bid_due_at >= due_after
        ]
    if fit_score_band is not None:
        opportunities = [
            item for item in opportunities if _matches_fit_score_band(item, fit_score_band)
        ]
    elif min_fit_score is not None:
        opportunities = [
            item for item in opportunities if (item.fit_score or 0) >= min_fit_score
        ]

    far_future = datetime.max.replace(tzinfo=timezone.utc)

    def _aware_datetime(value: Optional[datetime], fallback: datetime) -> datetime:
        resolved = value or fallback
        if resolved.tzinfo is None:
            return resolved.replace(tzinfo=timezone.utc)
        return resolved

    def due_key(item: Opportunity) -> tuple[datetime, int, datetime]:
        due = _aware_datetime(item.bid_due_at, far_future)
        updated = _aware_datetime(item.updated, datetime.min.replace(tzinfo=timezone.utc))
        return (due, -(item.fit_score or 0), updated)

    def fit_score_key(item: Opportunity, *, descending: bool) -> tuple[int, int, datetime, datetime]:
        has_score = item.fit_score is not None
        tier = 0 if has_score else 1
        score = item.fit_score if has_score else 0
        if descending:
            score = -score
        due = _aware_datetime(item.bid_due_at, far_future)
        updated = _aware_datetime(item.updated, datetime.min.replace(tzinfo=timezone.utc))
        return (tier, score, due, updated)

    if sort == "fit_score_desc":
        opportunities.sort(key=lambda item: fit_score_key(item, descending=True))
    elif sort == "fit_score_asc":
        opportunities.sort(key=lambda item: fit_score_key(item, descending=False))
    else:
        opportunities.sort(key=due_key)
    total = len(opportunities)
    return opportunities[offset : offset + limit], total


async def get_opportunity(opportunity_id: str) -> Opportunity:
    opportunity = await Opportunity.get(opportunity_id)
    if not isinstance(opportunity, Opportunity):
        raise NotFoundError("Opportunity not found")
    return opportunity


async def ensure_opportunity_description(opportunity: Opportunity) -> Opportunity:
    """Lazy-backfill SAM description when stored fields are a URL or JSON envelope."""

    # Late import: opportunity_collectors imports this module at load time.
    from construction_os.services.opportunity_collectors import (
        looks_like_json_description_envelope,
        looks_like_url,
        resolve_sam_description_fields,
    )

    def needs_repair(value: Optional[str]) -> bool:
        if not value:
            return False
        return looks_like_url(value) or looks_like_json_description_envelope(value)

    candidates = [
        opportunity.description_url,
        opportunity.description,
        opportunity.scope_summary,
    ]
    repair_candidate = next((c for c in candidates if c and needs_repair(c)), None)
    already_narrative = bool(
        opportunity.description
        and not needs_repair(opportunity.description)
        and opportunity.scope_summary
        and not needs_repair(opportunity.scope_summary)
    )
    if already_narrative or not repair_candidate:
        return opportunity

    narrative, description_url = await resolve_sam_description_fields(repair_candidate)
    if needs_repair(narrative):
        # Fetch/unwrap failed; keep URL fields and optionally stamp description_url
        if description_url and not opportunity.description_url:
            opportunity.description_url = description_url
            await opportunity.save()
        return opportunity

    opportunity.description = narrative
    opportunity.scope_summary = narrative
    if description_url:
        opportunity.description_url = description_url
    await opportunity.save()
    return opportunity


async def ensure_opportunity_document_names(opportunity: Opportunity) -> Opportunity:
    """Backfill human-readable titles for SAM attachments labeled download/search/etc."""

    from construction_os.services.opportunity_collectors import (
        is_generic_attachment_label,
        resolve_sam_attachment_name,
    )

    documents = list(opportunity.documents or [])
    if not documents:
        return opportunity

    changed = False
    updated: List[Dict[str, Any]] = []
    for index, raw in enumerate(documents):
        if not isinstance(raw, dict):
            continue
        entry = dict(raw)
        url = str(entry.get("url") or "").strip()
        if not url:
            updated.append(entry)
            continue
        current_name = str(entry.get("name") or "").strip() or None
        if current_name and not is_generic_attachment_label(current_name):
            updated.append(entry)
            continue
        try:
            resolved = await resolve_sam_attachment_name(
                url,
                preferred_name=current_name,
                index=index,
            )
        except Exception as exc:
            logger.debug("Document name backfill failed for {}: {}", url, exc)
            resolved = f"Attachment {index + 1}"
        if resolved != current_name:
            entry["name"] = resolved
            changed = True
        updated.append(entry)

    if changed:
        opportunity.documents = updated
        await opportunity.save()
    return opportunity


async def ingest_opportunity_documents(
    opportunity: Opportunity,
    project: Project,
) -> Opportunity:
    """Download solicitation files and create project Sources (best-effort)."""

    # Late import: opportunity_collectors imports this module at load time.
    from construction_os.services.opportunity_collectors import download_sam_attachment

    project_id = project.id
    if not project_id:
        raise InvalidInputError("Project must be saved before ingesting documents")

    stamped: List[Dict[str, Any]] = []
    seen_urls: set[str] = set()

    for raw in opportunity.documents or []:
        if not isinstance(raw, dict):
            continue
        url = str(raw.get("url") or "").strip()
        if not url:
            continue
        if url in seen_urls:
            stamped.append(
                {
                    **{k: v for k, v in raw.items() if k != "error"},
                    "url": url,
                    "ingest_status": "skipped",
                    "error": "Duplicate URL",
                }
            )
            continue
        seen_urls.add(url)

        name = str(raw.get("name") or "").strip() or None
        entry: Dict[str, Any] = {"url": url}
        if name:
            entry["name"] = name

        try:
            file_path = await download_sam_attachment(url, preferred_name=name)
            source = await create_upload_source_and_process(
                file_path=file_path,
                project_id=project_id,
                title=name or None,
                embed=True,
            )
            entry["source_id"] = source.id
            entry["ingest_status"] = "queued"
        except Exception as exc:
            logger.warning(
                "Failed to ingest opportunity document {} for {}: {}",
                url,
                opportunity.id,
                exc,
            )
            entry["ingest_status"] = "failed"
            entry["error"] = str(exc)

        stamped.append(entry)

    opportunity.documents = stamped
    await opportunity.save()
    return opportunity


async def upsert_opportunity(data: Dict[str, Any]) -> Tuple[Opportunity, bool]:
    """Create or refresh one normalized opportunity.

    Returns ``(opportunity, created)``. Workflow state and project linkage are
    preserved when a collector refreshes an existing record.
    """

    payload = dict(data)
    payload["fingerprint"] = payload.get("fingerprint") or build_fingerprint(payload)
    payload["last_seen_at"] = payload.get("last_seen_at") or utcnow()

    source_key = str(payload.get("source_key") or "").strip()
    external_id = str(payload.get("external_id") or "").strip()
    if not source_key or not external_id:
        raise InvalidInputError("source_key and external_id are required")

    rows = await repo_query(
        "SELECT * FROM opportunity WHERE (source_key = $source_key AND external_id = $external_id) OR fingerprint = $fingerprint LIMIT 1",
        {
            "source_key": source_key,
            "external_id": external_id,
            "fingerprint": payload["fingerprint"],
        },
    )

    created = not bool(rows)
    if rows:
        opportunity = Opportunity(**rows[0])
        # Workflow status / project linkage stay user-owned; source_stage refreshes from collectors.
        protected = {"id", "created", "status", "project_id", "archived"}
        for key, value in payload.items():
            if key not in protected and key in Opportunity.model_fields:
                setattr(opportunity, key, value)
    else:
        payload.setdefault("status", "none")
        payload.setdefault("source_stage", "early_research")
        opportunity = Opportunity(**payload)

    await opportunity.save()
    return opportunity, created


async def import_opportunities(items: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    created = 0
    updated = 0
    errors: List[Dict[str, str]] = []
    opportunity_ids: List[str] = []

    for index, item in enumerate(items):
        try:
            opportunity, was_created = await upsert_opportunity(item)
            opportunity_ids.append(opportunity.id or "")
            if was_created:
                created += 1
            else:
                updated += 1
        except Exception as exc:
            errors.append({"index": str(index), "error": str(exc)})

    return {
        "created": created,
        "updated": updated,
        "failed": len(errors),
        "errors": errors,
        "opportunity_ids": opportunity_ids,
    }


async def set_opportunity_status(opportunity_id: str, status: str) -> Opportunity:
    opportunity = await get_opportunity(opportunity_id)
    allowed = {
        "none",
        "watching",
        "pursuing",
        "submitted",
        "won",
        "lost",
        "no_bid",
        "ignored",
    }
    if status not in allowed:
        raise InvalidInputError(f"Unsupported opportunity status: {status}")
    opportunity.status = status  # type: ignore[assignment]
    await opportunity.save()
    return opportunity


def opportunity_summary_markdown(opportunity: Opportunity) -> str:
    due = opportunity.bid_due_at.isoformat() if opportunity.bid_due_at else "Not provided"
    prebid = opportunity.prebid_at.isoformat() if opportunity.prebid_at else "Not provided"
    questions = (
        opportunity.questions_due_at.isoformat()
        if opportunity.questions_due_at
        else "Not provided"
    )
    fit = f"{opportunity.fit_score}/100" if opportunity.fit_score is not None else "Not scored"

    return f"""# Opportunity Intake Summary

## Decision snapshot

- **Agency:** {opportunity.agency}
- **Solicitation:** {opportunity.solicitation_number or opportunity.external_id}
- **Type:** {opportunity.procurement_type}
- **Location:** {opportunity.location or opportunity.island}
- **Bid due:** {due}
- **Questions due:** {questions}
- **Pre-bid / site visit:** {prebid}
- **Fit score:** {fit}
- **Source:** {opportunity.source_url}

## Scope

{opportunity.scope_summary or opportunity.description or "Scope has not been extracted yet."}

## Primary point of contact

- **Name:** {opportunity.contact_name or "Not provided"}
- **Title:** {opportunity.contact_title or "Not provided"}
- **Email:** {opportunity.contact_email or "Not provided"}
- **Phone:** {opportunity.contact_phone or "Not provided"}

## Contracting office

{opportunity.office_address or "Not provided"}

## Attachments

{chr(10).join(f"- [{doc.get('name') or doc.get('url')}]({doc.get('url')})" for doc in opportunity.documents if isinstance(doc, dict) and doc.get("url")) or "- No attachments discovered."}

## Trades and licenses

**Trades:** {", ".join(opportunity.trades) or "Not identified"}

**Licenses:** {", ".join(opportunity.license_requirements) or "Not identified"}

## Fit reasons

{chr(10).join(f"- {reason}" for reason in opportunity.fit_reasons) or "- Fit has not been evaluated yet."}

## Risks and open requirements

{chr(10).join(f"- {risk}" for risk in opportunity.risk_flags) or "- No risk flags have been recorded yet."}

## Commercial requirements

- **Estimated value:** {opportunity.estimated_value_min or "Unknown"} to {opportunity.estimated_value_max or "Unknown"}
- **Bid bond required:** {opportunity.bid_bond_required if opportunity.bid_bond_required is not None else "Unknown"}
- **Bid bond percent:** {opportunity.bid_bond_percent if opportunity.bid_bond_percent is not None else "Unknown"}
- **Prevailing wage:** {opportunity.prevailing_wage_required if opportunity.prevailing_wage_required is not None else "Unknown"}
- **Mandatory site visit:** {opportunity.mandatory_site_visit if opportunity.mandatory_site_visit is not None else "Unknown"}

## Original notice

{opportunity.source_url}
"""


async def pursue_opportunity(opportunity_id: str) -> Tuple[Opportunity, Project, bool]:
    """Turn an opportunity into a Construction OS project brain."""

    opportunity = await get_opportunity(opportunity_id)
    if opportunity.project_id:
        project = await Project.get(opportunity.project_id)
        return opportunity, project, False

    project = Project(
        name=opportunity.title,
        description=(
            f"Bid workspace for {opportunity.agency}. "
            f"Solicitation {opportunity.solicitation_number or opportunity.external_id}. "
            f"Original notice: {opportunity.source_url}"
        ),
    )
    await project.save()

    await create_project_artifact(
        content=opportunity_summary_markdown(opportunity),
        project_id=project.id,
        title="Opportunity Intake Summary",
        artifact_kind="generated",
        save_idempotency_key=f"opportunity-intake:{opportunity.id}",
    )

    opportunity.project_id = project.id
    opportunity.status = "pursuing"
    await opportunity.save()

    # Best-effort: download attachments and queue extract/embed for each file
    try:
        opportunity = await ingest_opportunity_documents(opportunity, project)
    except Exception as exc:
        logger.warning(
            "Opportunity document ingest failed for {}: {}",
            opportunity.id,
            exc,
        )

    return opportunity, project, True


async def opportunity_dashboard() -> Dict[str, Any]:
    opportunities = [item for item in await Opportunity.get_all() if not item.archived]
    now = utcnow()
    due_soon_cutoff = now.timestamp() + (7 * 24 * 60 * 60)

    by_status: Dict[str, int] = {}
    for item in opportunities:
        by_status[item.status] = by_status.get(item.status, 0) + 1

    due_soon = 0
    overdue = 0
    high_fit = 0
    for item in opportunities:
        if item.fit_score is not None and item.fit_score >= 75:
            high_fit += 1
        if item.bid_due_at:
            due = item.bid_due_at
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if due < now and item.status not in {"submitted", "won", "lost", "no_bid", "ignored"}:
                overdue += 1
            elif now.timestamp() <= due.timestamp() <= due_soon_cutoff:
                due_soon += 1

    by_source_stage: Dict[str, int] = {}
    for item in opportunities:
        by_source_stage[item.source_stage] = by_source_stage.get(item.source_stage, 0) + 1

    pipeline_statuses = {"watching", "pursuing", "submitted"}
    pipeline_value_min = sum(
        item.estimated_value_min or 0
        for item in opportunities
        if item.status in pipeline_statuses
    )
    pipeline_value_max = sum(
        item.estimated_value_max or item.estimated_value_min or 0
        for item in opportunities
        if item.status in pipeline_statuses
    )

    return {
        "total": len(opportunities),
        "new": by_source_stage.get("early_research", 0),
        "watching": by_status.get("watching", 0),
        "pursuing": by_status.get("pursuing", 0),
        "submitted": by_status.get("submitted", 0),
        "high_fit": high_fit,
        "due_soon": due_soon,
        "overdue": overdue,
        "pipeline_value_min": pipeline_value_min,
        "pipeline_value_max": pipeline_value_max,
        "by_status": by_status,
        "by_source_stage": by_source_stage,
    }

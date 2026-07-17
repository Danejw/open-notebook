"""Portal collectors for the Opportunity Hub.

Collectors are adapters: each one retrieves an external format, normalizes it,
and sends records through the shared idempotent import service.
"""

from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from construction_os.database.repository import repo_query
from construction_os.domain.opportunity import HawaiiIsland, OpportunitySource
from construction_os.exceptions import ConfigurationError, ExternalServiceError
from construction_os.services.opportunities import (
    import_opportunities,
    seed_opportunity_sources,
)

SAM_OPPORTUNITIES_URL = "https://api.sam.gov/opportunities/v2/search"


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    for candidate in (text, text.replace("Z", "+00:00")):
        try:
            parsed = datetime.fromisoformat(candidate)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            continue
    for pattern in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, pattern).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _compact_text(value: Any) -> str:
    if value is None:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(value))
    return re.sub(r"\s+", " ", text).strip()


def _first_text(*values: Any) -> str:
    for value in values:
        text = _compact_text(value)
        if text:
            return text
    return ""


def _deep_get(data: Dict[str, Any], *path: str) -> Any:
    current: Any = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _infer_procurement_type(title: str, notice_type: str) -> str:
    combined = f"{title} {notice_type}".upper()
    for value in ("IFB", "RFP", "RFQ", "RFI", "ITB", "NOI"):
        if re.search(rf"\b{value}\b", combined):
            return value
    if "SOURCES SOUGHT" in combined or "REQUEST FOR INFORMATION" in combined:
        return "RFI"
    return "OTHER"


def _infer_island(place: str) -> HawaiiIsland:
    text = place.lower()
    mappings: List[tuple[HawaiiIsland, tuple[str, ...]]] = [
        (
            "Oahu",
            (
                "honolulu",
                "pearl harbor",
                "kapolei",
                "kaneohe",
                "wahiawa",
                "schofield",
                "ewa beach",
                "barbers point",
                "joint base pearl harbor",
                "ford island",
            ),
        ),
        ("Hawaii", ("hilo", "kailua-kona", "kona", "pohakuloa", "waimea, hi")),
        ("Maui", ("kahului", "wailuku", "kihei", "lahaina", "maui")),
        ("Kauai", ("lihue", "barking sands", "kauai", "kekaha")),
        ("Molokai", ("molokai", "kaunakakai")),
        ("Lanai", ("lanai", "lana'i")),
    ]
    for island, needles in mappings:
        if any(needle in text for needle in needles):
            return island
    return "Statewide" if "hawaii" in text or " hi " in f" {text} " else "Unknown"


def _extract_place(record: Dict[str, Any]) -> str:
    place = record.get("placeOfPerformance")
    if isinstance(place, dict):
        city = _first_text(_deep_get(place, "city", "name"), place.get("city"))
        state = _first_text(
            _deep_get(place, "state", "name"),
            _deep_get(place, "state", "code"),
            place.get("state"),
        )
        country = _first_text(
            _deep_get(place, "country", "name"),
            _deep_get(place, "country", "code"),
            place.get("country"),
        )
        return ", ".join(part for part in (city, state, country) if part)
    return _compact_text(place)


def _extract_contact(record: Dict[str, Any]) -> Dict[str, Optional[str]]:
    contacts = record.get("pointOfContact") or []
    if isinstance(contacts, dict):
        contacts = [contacts]
    contact = contacts[0] if isinstance(contacts, list) and contacts else {}
    if not isinstance(contact, dict):
        contact = {}
    return {
        "contact_name": _first_text(contact.get("fullName"), contact.get("name")) or None,
        "contact_email": _first_text(contact.get("email")) or None,
        "contact_phone": _first_text(contact.get("phone"), contact.get("fax")) or None,
    }


def normalize_sam_opportunity(record: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize one public SAM.gov opportunity response record."""

    notice_id = _first_text(record.get("noticeId"), record.get("noticeID"))
    title = _first_text(record.get("title"), "Untitled SAM.gov opportunity")
    solicitation_number = _first_text(record.get("solicitationNumber")) or None
    agency = _first_text(
        record.get("department"),
        record.get("subTier"),
        record.get("office"),
        "United States Government",
    )
    notice_type = _first_text(record.get("type"), record.get("typeOfSetAsideDescription"))
    place = _extract_place(record)
    description = _first_text(
        record.get("description"),
        record.get("additionalInfoLink"),
        record.get("fullParentPathName"),
    )
    ui_link = _first_text(record.get("uiLink"))
    source_url = ui_link or (
        f"https://sam.gov/opp/{notice_id}/view" if notice_id else "https://sam.gov/content/opportunities"
    )

    documents: List[Dict[str, Any]] = []
    for key in ("resourceLinks", "links"):
        links = record.get(key)
        if isinstance(links, list):
            for link in links:
                if isinstance(link, str):
                    documents.append({"url": link})
                elif isinstance(link, dict):
                    url = _first_text(link.get("href"), link.get("url"))
                    if url:
                        documents.append(
                            {
                                "url": url,
                                "name": _first_text(link.get("title"), link.get("name")),
                            }
                        )

    normalized = {
        "source_key": "sam_gov_hawaii",
        "external_id": notice_id or solicitation_number or title,
        "title": title,
        "agency": agency,
        "solicitation_number": solicitation_number,
        "procurement_type": _infer_procurement_type(title, notice_type),
        "island": _infer_island(place),
        "location": place,
        "scope_summary": description,
        "description": description,
        "published_at": _parse_datetime(record.get("postedDate")),
        "bid_due_at": _parse_datetime(
            record.get("responseDeadLine") or record.get("responseDeadline")
        ),
        "source_updated_at": _parse_datetime(
            record.get("modifiedDate") or record.get("archiveDate")
        ),
        "source_url": source_url,
        "documents": documents,
        "raw_payload": record,
        "extraction_confidence": 0.9 if notice_id and title and agency else 0.65,
    }
    normalized.update(_extract_contact(record))
    return normalized


async def _get_source(source_key: str) -> OpportunitySource:
    rows = await repo_query(
        "SELECT * FROM opportunity_source WHERE key = $key LIMIT 1",
        {"key": source_key},
    )
    if not rows:
        await seed_opportunity_sources()
        rows = await repo_query(
            "SELECT * FROM opportunity_source WHERE key = $key LIMIT 1",
            {"key": source_key},
        )
    return OpportunitySource(**rows[0])


async def sync_sam_gov_hawaii(
    *,
    days_back: int = 14,
    limit: int = 1000,
) -> Dict[str, Any]:
    """Import recent federal opportunities with a Hawaii place of performance."""

    api_key = os.getenv("SAM_GOV_API_KEY", "").strip()
    if not api_key:
        raise ConfigurationError(
            "SAM_GOV_API_KEY is required to sync federal Hawaii opportunities"
        )
    if not 1 <= days_back <= 365:
        raise ConfigurationError("days_back must be between 1 and 365")
    if not 1 <= limit <= 1000:
        raise ConfigurationError("limit must be between 1 and 1000")

    source = await _get_source("sam_gov_hawaii")
    today = date.today()
    params = {
        "api_key": api_key,
        "postedFrom": (today - timedelta(days=days_back)).strftime("%m/%d/%Y"),
        "postedTo": today.strftime("%m/%d/%Y"),
        "state": "HI",
        "limit": str(limit),
        "offset": "0",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(SAM_OPPORTUNITIES_URL, params=params)
            response.raise_for_status()
            payload = response.json()

        records = payload.get("opportunitiesData") or []
        normalized = [
            normalize_sam_opportunity(record)
            for record in records
            if isinstance(record, dict)
        ]
        result = await import_opportunities(normalized)

        source.last_synced_at = datetime.now(timezone.utc)
        source.last_sync_status = "partial" if result["failed"] else "success"
        source.last_error = (
            f"{result['failed']} records failed normalization or import"
            if result["failed"]
            else None
        )
        await source.save()

        return {
            **result,
            "source_key": source.key,
            "fetched": len(records),
            "total_records": int(payload.get("totalRecords") or len(records)),
            "posted_from": params["postedFrom"],
            "posted_to": params["postedTo"],
        }
    except (httpx.HTTPError, ValueError) as exc:
        source.last_synced_at = datetime.now(timezone.utc)
        source.last_sync_status = "failed"
        source.last_error = str(exc)
        await source.save()
        raise ExternalServiceError(f"SAM.gov opportunity sync failed: {exc}") from exc

"""Portal collectors for the Opportunity Hub.

Collectors are adapters: each one retrieves an external format, normalizes it,
and sends records through the shared idempotent import service.
"""

from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta, timezone
from email.message import Message
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx
from loguru import logger

from construction_os.config import UPLOADS_FOLDER
from construction_os.database.repository import repo_query
from construction_os.domain.opportunity import HawaiiIsland, OpportunitySource
from construction_os.exceptions import ConfigurationError, ExternalServiceError
from construction_os.services.opportunities import (
    import_opportunities,
    seed_opportunity_sources,
)

SAM_OPPORTUNITIES_URL = "https://api.sam.gov/opportunities/v2/search"
SAM_DOWNLOAD_TIMEOUT_SECONDS = 60.0

_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


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


def looks_like_url(value: str) -> bool:
    """Return True when ``value`` is an http(s) URL (typical SAM noticedesc)."""

    text = (value or "").strip()
    return bool(text) and bool(_URL_RE.match(text))


def append_sam_api_key(url: str, api_key: Optional[str] = None) -> str:
    """Append ``api_key`` query param when missing (SAM noticedesc / attachments)."""

    key = (api_key if api_key is not None else os.getenv("SAM_GOV_API_KEY", "")).strip()
    if not key or not url:
        return url
    parsed = urlparse(url.strip())
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if "api_key" not in query:
        query["api_key"] = key
    return urlunparse(parsed._replace(query=urlencode(query)))


def html_to_plain_text(html: str) -> str:
    """Strip tags and collapse whitespace from SAM noticedesc HTML."""

    if not html:
        return ""
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p\s*>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
    )
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()


async def fetch_sam_description_text(
    url: str,
    *,
    api_key: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> str:
    """Fetch SAM noticedesc HTML and return plain text."""

    fetch_url = append_sam_api_key(url, api_key)
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=SAM_DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True)
    try:
        response = await http.get(fetch_url)
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").lower()
        body = response.text
        if "html" in content_type or "<html" in body.lower() or "<p" in body.lower():
            return html_to_plain_text(body)
        return body.strip()
    finally:
        if owns_client:
            await http.aclose()


async def resolve_sam_description_fields(
    raw_description: str,
    *,
    api_key: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Tuple[str, Optional[str]]:
    """Return ``(narrative_or_raw, description_url)``.

    When ``raw_description`` is a URL, fetch the body. On failure keep the URL as
    the text value and still return it as ``description_url``.
    """

    text = (raw_description or "").strip()
    if not looks_like_url(text):
        return text, None
    try:
        narrative = await fetch_sam_description_text(text, api_key=api_key, client=client)
        if narrative:
            return narrative, text
        return text, text
    except Exception as exc:
        logger.warning("Failed to fetch SAM description from {}: {}", text, exc)
        return text, text


def _filename_from_content_disposition(header: Optional[str]) -> Optional[str]:
    if not header:
        return None
    message = Message()
    message["content-disposition"] = header
    filename = message.get_filename()
    if filename:
        return os.path.basename(filename.strip().strip('"'))
    return None


def _unique_upload_path(preferred_name: str) -> str:
    upload_folder = Path(UPLOADS_FOLDER)
    upload_folder.mkdir(parents=True, exist_ok=True)
    safe_filename = os.path.basename(preferred_name) or "sam-attachment.bin"
    stem = Path(safe_filename).stem
    suffix = Path(safe_filename).suffix
    counter = 0
    while True:
        new_filename = safe_filename if counter == 0 else f"{stem} ({counter}){suffix}"
        full_path = (upload_folder / new_filename).resolve()
        if not str(full_path).startswith(str(upload_folder.resolve()) + os.sep):
            raise ValueError("Invalid filename: path traversal detected")
        if not full_path.exists():
            return str(full_path)
        counter += 1


async def download_sam_attachment(
    url: str,
    *,
    preferred_name: Optional[str] = None,
    api_key: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> str:
    """Download a SAM ``resourceLinks`` attachment into ``UPLOADS_FOLDER``.

    Returns the absolute file path. Raises on empty or HTTP error bodies.
    """

    fetch_url = append_sam_api_key(url, api_key)
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=SAM_DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True)
    try:
        response = await http.get(fetch_url)
        response.raise_for_status()
        content = response.content
        if not content:
            raise ExternalServiceError("SAM attachment download returned empty body")

        content_type = (response.headers.get("content-type") or "").lower()
        # Reject obvious HTML error pages masquerading as files
        if "text/html" in content_type and len(content) < 50_000:
            snippet = content[:200].decode("utf-8", errors="ignore").lower()
            if "<html" in snippet or "description not found" in snippet:
                raise ExternalServiceError(
                    "SAM attachment URL returned an HTML error page, not a file"
                )

        name = (
            preferred_name
            or _filename_from_content_disposition(response.headers.get("content-disposition"))
            or os.path.basename(urlparse(url).path)
            or "sam-attachment.bin"
        )
        if not Path(name).suffix:
            if "pdf" in content_type:
                name = f"{name}.pdf"
            elif "zip" in content_type:
                name = f"{name}.zip"
            elif "msword" in content_type or "wordprocessingml" in content_type:
                name = f"{name}.docx"

        file_path = _unique_upload_path(name)
        with open(file_path, "wb") as handle:
            handle.write(content)
        logger.info("Downloaded SAM attachment to {}", file_path)
        return file_path
    finally:
        if owns_client:
            await http.aclose()


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


async def normalize_sam_opportunity(
    record: Dict[str, Any],
    *,
    api_key: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, Any]:
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
    raw_description = _first_text(
        record.get("description"),
        record.get("additionalInfoLink"),
        record.get("fullParentPathName"),
    )
    description, description_url = await resolve_sam_description_fields(
        raw_description,
        api_key=api_key,
        client=client,
    )
    ui_link = _first_text(record.get("uiLink"))
    source_url = ui_link or (
        f"https://sam.gov/opp/{notice_id}/view" if notice_id else "https://sam.gov/content/opportunities"
    )

    documents: List[Dict[str, Any]] = []
    seen_urls: set[str] = set()
    for key in ("resourceLinks", "links"):
        links = record.get(key)
        if isinstance(links, list):
            for link in links:
                if isinstance(link, str):
                    url = link.strip()
                    name = ""
                elif isinstance(link, dict):
                    # Skip HAL self links that are not file attachments
                    rel = _first_text(link.get("rel")).lower()
                    if rel == "self":
                        continue
                    url = _first_text(link.get("href"), link.get("url"))
                    name = _first_text(link.get("title"), link.get("name"))
                else:
                    continue
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                entry: Dict[str, Any] = {"url": url}
                if name:
                    entry["name"] = name
                documents.append(entry)

    normalized: Dict[str, Any] = {
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
    if description_url:
        normalized["description_url"] = description_url
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
            normalized: List[Dict[str, Any]] = []
            for record in records:
                if not isinstance(record, dict):
                    continue
                normalized.append(
                    await normalize_sam_opportunity(
                        record,
                        api_key=api_key,
                        client=client,
                    )
                )
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

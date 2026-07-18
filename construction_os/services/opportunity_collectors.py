"""Portal collectors for the Opportunity Hub.

Collectors are adapters: each one retrieves an external format, normalizes it,
and sends records through the shared idempotent import service.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from email.message import Message
from html.parser import HTMLParser
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


def html_to_markdown(html: str) -> str:
    """Convert SAM noticedesc HTML into Markdown suitable for MarkdownRenderer."""

    if not html:
        return ""

    class _HTMLToMarkdown(HTMLParser):
        def __init__(self) -> None:
            super().__init__(convert_charrefs=True)
            self.parts: List[str] = []
            self._list_stack: List[str] = []
            self._li_ordered_index: List[int] = []
            self._skip_depth = 0
            self._href: Optional[str] = None

        def handle_starttag(self, tag: str, attrs: List[tuple[str, Optional[str]]]) -> None:
            if self._skip_depth:
                if tag in {"script", "style"}:
                    self._skip_depth += 1
                return
            attrs_map = {key.lower(): (value or "") for key, value in attrs}
            if tag in {"script", "style"}:
                self._skip_depth = 1
                return
            if tag in {"br", "hr"}:
                self.parts.append("\n\n" if tag == "hr" else "\n")
            elif tag in {"p", "div", "section"}:
                self.parts.append("\n\n")
            elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                level = int(tag[1])
                self.parts.append("\n\n" + ("#" * level) + " ")
            elif tag in {"strong", "b"}:
                self.parts.append("**")
            elif tag in {"em", "i"}:
                self.parts.append("*")
            elif tag == "code":
                self.parts.append("`")
            elif tag == "ul":
                self._list_stack.append("ul")
                self.parts.append("\n")
            elif tag == "ol":
                self._list_stack.append("ol")
                self._li_ordered_index.append(0)
                self.parts.append("\n")
            elif tag == "li":
                indent = "  " * max(len(self._list_stack) - 1, 0)
                if self._list_stack and self._list_stack[-1] == "ol":
                    self._li_ordered_index[-1] += 1
                    self.parts.append(f"\n{indent}{self._li_ordered_index[-1]}. ")
                else:
                    self.parts.append(f"\n{indent}- ")
            elif tag == "a":
                self._href = attrs_map.get("href") or None
                self.parts.append("[")
            elif tag == "blockquote":
                self.parts.append("\n\n> ")

        def handle_endtag(self, tag: str) -> None:
            if self._skip_depth:
                if tag in {"script", "style"}:
                    self._skip_depth -= 1
                return
            if tag in {"p", "div", "section", "h1", "h2", "h3", "h4", "h5", "h6"}:
                self.parts.append("\n\n")
            elif tag in {"strong", "b"}:
                self.parts.append("**")
            elif tag in {"em", "i"}:
                self.parts.append("*")
            elif tag == "code":
                self.parts.append("`")
            elif tag == "ul":
                if self._list_stack and self._list_stack[-1] == "ul":
                    self._list_stack.pop()
                self.parts.append("\n")
            elif tag == "ol":
                if self._list_stack and self._list_stack[-1] == "ol":
                    self._list_stack.pop()
                if self._li_ordered_index:
                    self._li_ordered_index.pop()
                self.parts.append("\n")
            elif tag == "a":
                href = self._href or ""
                self._href = None
                self.parts.append(f"]({href})" if href else "]")
            elif tag == "blockquote":
                self.parts.append("\n\n")

        def handle_data(self, data: str) -> None:
            if self._skip_depth:
                return
            text = data.replace("\xa0", " ")
            if not text:
                return
            self.parts.append(text)

    parser = _HTMLToMarkdown()
    parser.feed(html)
    parser.close()
    markdown = "".join(parser.parts)
    markdown = markdown.replace("\r\n", "\n")
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    return markdown.strip()


def html_to_plain_text(html: str) -> str:
    """Compatibility wrapper: convert HTML via Markdown then flatten to plain text."""

    markdown = html_to_markdown(html)
    text = re.sub(r"[#>*_`\[\]()!-]+", " ", markdown)
    return re.sub(r"\s+", " ", text).strip()


def looks_like_json_description_envelope(value: str) -> bool:
    """True when stored text is a SAM noticedesc JSON payload, not narrative."""

    text = (value or "").strip()
    return text.startswith("{") and '"description"' in text


def unwrap_sam_description_payload(body: str) -> str:
    """Extract narrative from a SAM noticedesc response body.

    SAM often returns ``{"description": "..."}`` JSON. Older records may have
    stored that envelope as the scope string; unwrap it before Markdown render.
    """

    text = (body or "").strip()
    if not text:
        return ""

    if text.startswith("{") or text.startswith("["):
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict):
            for key in ("description", "descriptionText", "noticeDescription"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    text = value.strip()
                    break
        elif isinstance(payload, str) and payload.strip():
            text = payload.strip()

    lower = text.lower()
    if "<html" in lower or "<p" in lower or "<div" in lower or "<br" in lower:
        return html_to_markdown(text)

    # Plain text from JSON often uses blank-line section breaks; keep them.
    return text.replace("\r\n", "\n").strip()


async def fetch_sam_description_text(
    url: str,
    *,
    api_key: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> str:
    """Fetch SAM noticedesc and return Markdown-ready narrative text."""

    fetch_url = append_sam_api_key(url, api_key)
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=SAM_DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True)
    try:
        response = await http.get(fetch_url)
        response.raise_for_status()
        return unwrap_sam_description_payload(response.text)
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

    When ``raw_description`` is a URL, fetch the body. When it is a stored JSON
    envelope, unwrap it. On fetch failure keep the URL as the text value and
    still return it as ``description_url``.
    """

    text = (raw_description or "").strip()
    if looks_like_json_description_envelope(text):
        narrative = unwrap_sam_description_payload(text)
        if narrative and narrative != text:
            return narrative, None
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


_GENERIC_ATTACHMENT_LABELS = frozenset(
    {
        "download",
        "search",
        "view",
        "files",
        "file",
        "attachment",
        "attachments",
        "resource",
        "resources",
        "opportunities",
        "api",
        "prod",
        "alpha",
    }
)


def is_generic_attachment_label(value: Optional[str]) -> bool:
    """Return True for path labels like download/search that are not real titles."""

    text = (value or "").strip()
    if not text:
        return True
    stem = Path(text).stem.lower() if "." in text else text.lower()
    base = text.lower().split("?")[0].rstrip("/")
    leaf = base.rsplit("/", 1)[-1]
    return leaf in _GENERIC_ATTACHMENT_LABELS or stem in _GENERIC_ATTACHMENT_LABELS


def _is_generic_attachment_label(value: Optional[str]) -> bool:
    return is_generic_attachment_label(value)


def _filename_from_url(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for key in ("fileName", "filename", "name", "title"):
        candidate = _first_text(query.get(key))
        if candidate and not _is_generic_attachment_label(candidate):
            return os.path.basename(candidate)
    path = parsed.path.rstrip("/")
    if not path:
        return None
    leaf = os.path.basename(path)
    if leaf and not _is_generic_attachment_label(leaf):
        # Prefer segments that look like real files (have an extension)
        if "." in leaf:
            return leaf
    # Sometimes .../MyFile.pdf/download — use parent segment
    parent = os.path.basename(os.path.dirname(path))
    if parent and not _is_generic_attachment_label(parent) and "." in parent:
        return parent
    return None


async def resolve_sam_attachment_name(
    url: str,
    *,
    preferred_name: Optional[str] = None,
    api_key: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
    index: int = 0,
) -> str:
    """Resolve a human-readable attachment title for a SAM resource link."""

    if preferred_name and not _is_generic_attachment_label(preferred_name):
        return preferred_name.strip()

    from_url = _filename_from_url(url)
    if from_url:
        return from_url

    fetch_url = append_sam_api_key(url, api_key)
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=15.0, follow_redirects=True)
    try:
        try:
            response = await http.head(fetch_url)
            if response.status_code >= 400:
                response = await http.get(fetch_url)
            filename = _filename_from_content_disposition(
                response.headers.get("content-disposition")
            )
            if filename and not _is_generic_attachment_label(filename):
                return filename
            # Last-path after redirects
            final_url = str(response.url) if response.url else url
            redirected = _filename_from_url(final_url)
            if redirected:
                return redirected
        except Exception as exc:
            logger.debug("Could not resolve SAM attachment name for {}: {}", url, exc)
    finally:
        if owns_client:
            await http.aclose()

    return f"Attachment {index + 1}"


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


def _extract_office_address(record: Dict[str, Any]) -> Optional[str]:
    """Format SAM ``officeAddress`` into a single display string."""

    office = record.get("officeAddress")
    if not isinstance(office, dict):
        return None
    street = _first_text(
        office.get("streetAddress"),
        office.get("street"),
        office.get("address"),
    )
    city = _first_text(office.get("city"))
    state = _first_text(office.get("state"))
    zip_code = _first_text(
        office.get("zipcode"),
        office.get("zip"),
        office.get("zipCode"),
    )
    country = _first_text(office.get("countryCode"), office.get("country"))
    city_state = ", ".join(part for part in (city, state) if part)
    if zip_code:
        city_state = f"{city_state} {zip_code}".strip()
    parts = [part for part in (street, city_state, country) if part]
    return ", ".join(parts) if parts else None


def _extract_contact(record: Dict[str, Any]) -> Dict[str, Optional[str]]:
    contacts = record.get("pointOfContact") or []
    if isinstance(contacts, dict):
        contacts = [contacts]
    if not isinstance(contacts, list):
        contacts = []

    primary: Dict[str, Any] = {}
    fallback: Dict[str, Any] = {}
    for item in contacts:
        if not isinstance(item, dict):
            continue
        if not fallback:
            fallback = item
        contact_type = _first_text(item.get("type")).lower()
        if contact_type == "primary":
            primary = item
            break
    contact = primary or fallback

    return {
        "contact_name": _first_text(contact.get("fullName"), contact.get("name")) or None,
        "contact_email": _first_text(contact.get("email")) or None,
        "contact_phone": _first_text(contact.get("phone"), contact.get("fax")) or None,
        "contact_title": _first_text(contact.get("title")) or None,
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
                if name and not _is_generic_attachment_label(name):
                    entry["name"] = name
                documents.append(entry)

    for index, doc in enumerate(documents):
        current_name = str(doc.get("name") or "").strip() or None
        if current_name and not _is_generic_attachment_label(current_name):
            continue
        doc["name"] = await resolve_sam_attachment_name(
            str(doc["url"]),
            preferred_name=current_name,
            api_key=api_key,
            client=client,
            index=index,
        )

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
    office_address = _extract_office_address(record)
    if office_address:
        normalized["office_address"] = office_address
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

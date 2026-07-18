"""Canonical Collection manifest and item parsing."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse, urlunparse

import yaml

from construction_os.mcp.url_safety import McpUrlError, validate_mcp_url

REQUIRED_ENTRY = "COLLECTION.md"
ITEMS_FILE = "items.yaml"
COLLECTION_TYPE = "collection"
SLUG_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
MAX_SLUG_LEN = 64
MAX_NAME_LEN = 128
MAX_DESCRIPTION_LEN = 2048
DEFAULT_MAX_ITEMS = 12
SUPPORTED_ITEM_TYPES = frozenset(
    {"text", "url", "document_reference", "note", "query"}
)
DEFAULT_ITEM_TYPE = "text"


class CollectionStandardError(ValueError):
    """Raised when a collection package violates the standard."""


@dataclass
class CollectionFrontmatterResult:
    name: Optional[str]
    slug: Optional[str]
    description: Optional[str]
    version: Optional[str]
    raw: dict[str, Any]
    body: str
    errors: list[str]


@dataclass
class ParsedCollectionItem:
    item_id: str
    type: str
    title: str
    url: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] | None = None
    topics: list[str] | None = None
    authority: Optional[str] = None
    enabled: bool = True
    priority: Optional[int] = None
    metadata: dict[str, Any] | None = None
    sort_order: int = 0


def slugify_name(name: str) -> str:
    """Derive a kebab-case slug from a display name."""
    raw = name.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    if not slug:
        raise CollectionStandardError("Cannot derive slug from empty name")
    if len(slug) > MAX_SLUG_LEN:
        slug = slug[:MAX_SLUG_LEN].rstrip("-")
    if not SLUG_PATTERN.match(slug):
        raise CollectionStandardError(f"Invalid slug derived from name: {slug}")
    return slug


def validate_slug(slug: str) -> list[str]:
    errors: list[str] = []
    if not slug or not str(slug).strip():
        errors.append("Collection slug is required")
        return errors
    value = str(slug).strip()
    if len(value) > MAX_SLUG_LEN:
        errors.append(f"Collection slug must be at most {MAX_SLUG_LEN} characters")
    if not SLUG_PATTERN.match(value):
        errors.append(
            "Collection slug must be kebab-case (lowercase letters, numbers, hyphens)"
        )
    return errors


def validate_collection_name(name: str) -> list[str]:
    errors: list[str] = []
    if not name or not str(name).strip():
        errors.append("Collection name is required")
        return errors
    if len(str(name)) > MAX_NAME_LEN:
        errors.append(f"Collection name must be at most {MAX_NAME_LEN} characters")
    return errors


def validate_collection_description(description: str) -> list[str]:
    errors: list[str] = []
    if not description or not str(description).strip():
        errors.append("Collection description is required")
        return errors
    if len(str(description)) > MAX_DESCRIPTION_LEN:
        errors.append(
            f"Collection description must be at most {MAX_DESCRIPTION_LEN} characters"
        )
    return errors


def normalize_collection_url(url: str) -> str:
    """Validate and normalize a collection item URL."""
    if not url or not str(url).strip():
        raise CollectionStandardError("URL is required for url items")
    cleaned = validate_mcp_url(str(url).strip())
    parsed = urlparse(cleaned)
    normalized = urlunparse(
        (
            parsed.scheme,
            parsed.netloc.lower(),
            parsed.path or "",
            parsed.params,
            parsed.query,
            "",
        )
    )
    return normalized.rstrip("/") if parsed.path in ("", "/") else normalized


def parse_collection_md(content: str) -> CollectionFrontmatterResult:
    """Parse COLLECTION.md YAML frontmatter and body."""
    errors: list[str] = []
    if content is None:
        return CollectionFrontmatterResult(
            None, None, None, None, {}, "", ["COLLECTION.md content is empty"]
        )
    text = content if isinstance(content, str) else content.decode("utf-8", errors="replace")
    if not text.strip():
        return CollectionFrontmatterResult(
            None, None, None, None, {}, "", ["COLLECTION.md content is empty"]
        )

    raw: dict[str, Any] = {}
    body = text
    if text.startswith("---"):
        match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
        if not match:
            errors.append("COLLECTION.md has invalid YAML frontmatter delimiters")
        else:
            fm_text, body = match.group(1), match.group(2)
            try:
                loaded = yaml.safe_load(fm_text) or {}
                if not isinstance(loaded, dict):
                    errors.append("COLLECTION.md frontmatter must be a YAML mapping")
                else:
                    raw = loaded
            except yaml.YAMLError as exc:
                errors.append(f"COLLECTION.md frontmatter YAML error: {exc}")
    else:
        errors.append("COLLECTION.md must start with YAML frontmatter (---)")

    item_type = raw.get("type")
    if item_type is not None and str(item_type).strip() != COLLECTION_TYPE:
        errors.append(f"COLLECTION.md type must be '{COLLECTION_TYPE}'")

    name = raw.get("name")
    if name is not None:
        name = str(name).strip()
        errors.extend(validate_collection_name(name))
    else:
        errors.append("COLLECTION.md frontmatter missing required field: name")

    description = raw.get("description")
    if description is not None:
        description = str(description).strip()
        errors.extend(validate_collection_description(description))
    else:
        errors.append("COLLECTION.md frontmatter missing required field: description")

    version = raw.get("version")
    if version is not None:
        version = str(version).strip()
    else:
        version = "1.0.0"

    slug_raw = raw.get("id") or raw.get("slug")
    slug: Optional[str] = None
    if slug_raw is not None:
        slug = str(slug_raw).strip()
        errors.extend(validate_slug(slug))
    elif name:
        try:
            slug = slugify_name(name)
        except CollectionStandardError as exc:
            errors.append(str(exc))

    return CollectionFrontmatterResult(
        name=name if isinstance(name, str) else None,
        slug=slug,
        description=description if isinstance(description, str) else None,
        version=version,
        raw=raw,
        body=body or "",
        errors=errors,
    )


def parse_items_yaml(content: str) -> tuple[list[ParsedCollectionItem], list[str]]:
    """Parse items.yaml into normalized item records."""
    errors: list[str] = []
    if not content or not str(content).strip():
        return [], errors
    try:
        loaded = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        return [], [f"items.yaml YAML error: {exc}"]

    if loaded is None:
        return [], errors
    if not isinstance(loaded, list):
        return [], ["items.yaml must be a YAML list of items"]

    items: list[ParsedCollectionItem] = []
    seen_ids: set[str] = set()
    seen_urls: set[str] = set()

    for index, entry in enumerate(loaded):
        if not isinstance(entry, dict):
            errors.append(f"Item at index {index} must be a mapping")
            continue

        item_id = str(entry.get("id") or "").strip()
        if not item_id:
            errors.append(f"Item at index {index} missing required field: id")
            continue
        if item_id in seen_ids:
            errors.append(f"Duplicate item id: {item_id}")
            continue
        seen_ids.add(item_id)

        item_type = str(entry.get("type") or DEFAULT_ITEM_TYPE).strip().lower()
        if item_type not in SUPPORTED_ITEM_TYPES:
            errors.append(f"Unsupported item type '{item_type}' for {item_id}")
            continue

        title = str(entry.get("title") or item_id).strip()
        if not title:
            errors.append(f"Item {item_id} missing title")
            continue

        url: Optional[str] = None
        if item_type == "url":
            raw_url = entry.get("url")
            if not raw_url:
                errors.append(f"Item {item_id} missing url")
                continue
            try:
                url = normalize_collection_url(str(raw_url))
            except (CollectionStandardError, McpUrlError) as exc:
                errors.append(f"Item {item_id} invalid url: {exc}")
                continue
            if url in seen_urls:
                errors.append(f"Duplicate normalized url: {url}")
                continue
            seen_urls.add(url)
        elif entry.get("url"):
            # Optional URL on non-url types (e.g. title is a code, url is a reference).
            try:
                url = normalize_collection_url(str(entry.get("url")))
            except (CollectionStandardError, McpUrlError):
                url = str(entry.get("url") or "").strip() or None

        tags = entry.get("tags")
        topics = entry.get("topics")
        metadata = {
            k: v
            for k, v in entry.items()
            if k
            not in {
                "id",
                "type",
                "title",
                "url",
                "description",
                "tags",
                "topics",
                "authority",
                "enabled",
                "priority",
                "notes",
            }
        }
        notes = entry.get("notes")
        if notes is not None:
            metadata["notes"] = notes

        items.append(
            ParsedCollectionItem(
                item_id=item_id,
                type=item_type,
                title=title,
                url=url,
                description=str(entry.get("description") or "").strip() or None,
                tags=[str(t) for t in tags] if isinstance(tags, list) else [],
                topics=[str(t) for t in topics] if isinstance(topics, list) else [],
                authority=str(entry.get("authority") or "").strip() or None,
                enabled=bool(entry.get("enabled", True)),
                priority=int(entry["priority"]) if entry.get("priority") is not None else None,
                metadata=metadata or None,
                sort_order=index,
            )
        )

    return items, errors


def build_collection_md(
    *,
    name: str,
    slug: str,
    description: str,
    version: str = "1.0.0",
    tags: list[str] | None = None,
    use_when: list[str] | None = None,
    visibility: str = "instance",
    status: str = "active",
    selection: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    body: str = "",
) -> str:
    """Build COLLECTION.md content for export."""
    fm: dict[str, Any] = {
        "id": slug,
        "name": name,
        "type": COLLECTION_TYPE,
        "version": version,
        "description": description,
        "visibility": visibility,
        "status": status,
    }
    if tags:
        fm["tags"] = tags
    if use_when:
        fm["use_when"] = use_when
    if selection:
        fm["selection"] = selection
    if extra:
        for key, value in extra.items():
            if key not in fm:
                fm[key] = value
    yaml_block = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip()
    return f"---\n{yaml_block}\n---\n\n{body}".rstrip() + "\n"


def build_items_yaml(items: list[ParsedCollectionItem]) -> str:
    """Serialize items to items.yaml for export."""
    rows: list[dict[str, Any]] = []
    for item in items:
        row: dict[str, Any] = {
            "id": item.item_id,
            "type": item.type,
            "title": item.title,
            "enabled": item.enabled,
        }
        if item.url:
            row["url"] = item.url
        if item.description:
            row["description"] = item.description
        if item.tags:
            row["tags"] = item.tags
        if item.topics:
            row["topics"] = item.topics
        if item.authority:
            row["authority"] = item.authority
        if item.priority is not None:
            row["priority"] = item.priority
        if item.metadata:
            row.update(item.metadata)
        rows.append(row)
    return yaml.safe_dump(rows, sort_keys=False, allow_unicode=True)

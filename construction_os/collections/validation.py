"""Collection validation helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from construction_os.collections.standard import (
    CollectionStandardError,
    ParsedCollectionItem,
    normalize_collection_url,
    parse_collection_md,
    parse_items_yaml,
    validate_collection_description,
    validate_collection_name,
    validate_slug,
)
from construction_os.domain.collection import Collection, CollectionItem


@dataclass
class ValidationIssue:
    severity: str
    message: str
    path: Optional[str] = None
    fix: Optional[str] = None


def _issue(
    severity: str,
    message: str,
    *,
    path: Optional[str] = None,
    fix: Optional[str] = None,
) -> ValidationIssue:
    return ValidationIssue(severity=severity, message=message, path=path, fix=fix)


def validate_item_record(item: CollectionItem) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if not item.item_id or not str(item.item_id).strip():
        issues.append(_issue("error", "Item id is required", path="item_id"))
    if not item.title or not str(item.title).strip():
        issues.append(_issue("error", "Item title is required", path="title"))
    if item.type == "url":
        if not item.url:
            issues.append(
                _issue("error", "URL items require a url", path="url", fix="Add https:// URL")
            )
        else:
            try:
                normalize_collection_url(item.url)
            except (CollectionStandardError, Exception) as exc:
                issues.append(_issue("error", f"Invalid URL: {exc}", path="url"))
    if item.type == "naics":
        metadata = item.metadata or {}
        code = str(metadata.get("naics_code") or item.item_id or "").strip()
        code = re.sub(r"\D", "", code)
        if not re.fullmatch(r"\d{2,6}", code):
            issues.append(
                _issue(
                    "error",
                    "NAICS items require a 2-6 digit code",
                    path=item.item_id or "metadata.naics_code",
                    fix="Enter a valid NAICS sector, subsector, or industry code",
                )
            )
    return issues


def validate_collection_metadata(
    *,
    name: str,
    slug: str,
    description: str,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for msg in validate_collection_name(name):
        issues.append(_issue("error", msg, path="name"))
    for msg in validate_slug(slug):
        issues.append(_issue("error", msg, path="slug"))
    for msg in validate_collection_description(description):
        issues.append(_issue("error", msg, path="description"))
    return issues


def validate_items_list(items: Iterable[CollectionItem]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    seen_ids: set[str] = set()
    seen_urls: set[str] = set()
    for item in items:
        issues.extend(validate_item_record(item))
        if item.item_id in seen_ids:
            issues.append(
                _issue("error", f"Duplicate item id: {item.item_id}", path=item.item_id)
            )
        seen_ids.add(item.item_id)
        if item.type == "url" and item.url:
            try:
                normalized = normalize_collection_url(item.url)
            except Exception:
                continue
            if normalized in seen_urls:
                issues.append(
                    _issue(
                        "error",
                        f"Duplicate normalized url: {normalized}",
                        path=item.item_id,
                    )
                )
            seen_urls.add(normalized)
    return issues


async def validate_collection_record(collection: Collection) -> dict[str, Any]:
    """Validate a persisted collection and return a ValidationResponse-shaped dict."""
    issues: list[ValidationIssue] = []
    issues.extend(
        validate_collection_metadata(
            name=collection.name,
            slug=collection.slug,
            description=collection.description,
        )
    )
    items = await collection.get_items()
    issues.extend(validate_items_list(items))
    if not items:
        issues.append(
            _issue(
                "warning",
                "Collection has no items",
                fix="Add at least one reference item",
            )
        )
    return {
        "valid": not any(i.severity == "error" for i in issues),
        "issues": [
            {
                "severity": i.severity,
                "message": i.message,
                "path": i.path,
                "fix": i.fix,
            }
            for i in issues
        ],
    }


def validate_package_text(
    collection_md: str,
    items_yaml: str,
) -> tuple[list[ValidationIssue], Optional[dict[str, Any]], list[ParsedCollectionItem]]:
    """Validate import package text before persistence."""
    issues: list[ValidationIssue] = []
    parsed = parse_collection_md(collection_md)
    for err in parsed.errors:
        issues.append(_issue("error", err, path="COLLECTION.md"))

    items, item_errors = parse_items_yaml(items_yaml)
    for err in item_errors:
        issues.append(_issue("error", err, path="items.yaml"))

    meta: Optional[dict[str, Any]] = None
    if parsed.name and parsed.slug and parsed.description:
        meta = {
            "name": parsed.name,
            "slug": parsed.slug,
            "description": parsed.description,
            "version": parsed.version or "1.0.0",
            "tags": parsed.raw.get("tags") or [],
            "use_when": parsed.raw.get("use_when") or [],
            "visibility": str(parsed.raw.get("visibility") or "instance"),
            "status": str(parsed.raw.get("status") or "draft"),
            "selection": parsed.raw.get("selection"),
            "manifest_extra": {
                k: v
                for k, v in parsed.raw.items()
                if k
                not in {
                    "id",
                    "slug",
                    "name",
                    "type",
                    "version",
                    "description",
                    "tags",
                    "use_when",
                    "visibility",
                    "status",
                    "selection",
                }
            },
            "manifest_raw": collection_md,
        }

    return issues, meta, items

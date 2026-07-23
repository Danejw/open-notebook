"""Import and export helpers for Collection packages."""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from typing import Optional

from construction_os.collections.standard import (
    ITEMS_FILE,
    REQUIRED_ENTRY,
    ParsedCollectionItem,
    build_collection_md,
    build_items_yaml,
)
from construction_os.collections.validation import validate_package_text
from construction_os.domain.collection import Collection, CollectionItem


@dataclass
class CollectionPackagePreview:
    root_name: str
    name: Optional[str]
    slug: Optional[str]
    description: Optional[str]
    collection_md: str
    items_yaml: str
    items: list[ParsedCollectionItem]
    errors: list[str]
    warnings: list[str]
    source_filename: Optional[str] = None


def extract_collection_zip(data: bytes, source_filename: Optional[str] = None) -> CollectionPackagePreview:
    """Extract COLLECTION.md and items.yaml from a zip upload."""
    errors: list[str] = []
    warnings: list[str] = []
    root_name = "collection"
    collection_md = ""
    items_yaml = ""

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = [n for n in zf.namelist() if not n.endswith("/")]
            md_paths = [n for n in names if n.endswith(REQUIRED_ENTRY)]
            yaml_paths = [n for n in names if n.endswith(ITEMS_FILE)]

            if not md_paths:
                errors.append(f"Package must contain {REQUIRED_ENTRY}")
            else:
                md_path = md_paths[0]
                root_name = md_path.split("/")[0] if "/" in md_path else root_name
                collection_md = zf.read(md_path).decode("utf-8", errors="replace")

            if yaml_paths:
                items_yaml = zf.read(yaml_paths[0]).decode("utf-8", errors="replace")
            elif collection_md:
                warnings.append(f"No {ITEMS_FILE} found; collection will have no items")
    except zipfile.BadZipFile:
        errors.append("Invalid zip file")

    issues, meta, items = validate_package_text(collection_md, items_yaml)
    for issue in issues:
        if issue.severity == "error":
            errors.append(issue.message)
        else:
            warnings.append(issue.message)

    return CollectionPackagePreview(
        root_name=root_name,
        name=meta.get("name") if meta else None,
        slug=meta.get("slug") if meta else None,
        description=meta.get("description") if meta else None,
        collection_md=collection_md,
        items_yaml=items_yaml,
        items=items,
        errors=errors,
        warnings=warnings,
        source_filename=source_filename,
    )


def build_collection_zip(collection: Collection, items: list[CollectionItem]) -> bytes:
    """Build an export zip with COLLECTION.md and items.yaml."""
    extra = collection.manifest_extra or {}
    selection = collection.selection
    parsed_items = [
        ParsedCollectionItem(
            item_id=i.item_id,
            type=i.type,
            title=i.title,
            url=i.url,
            description=i.description,
            tags=i.tags or [],
            topics=i.topics or [],
            authority=i.authority,
            enabled=i.enabled,
            priority=i.priority,
            metadata=i.metadata,
            sort_order=i.sort_order,
        )
        for i in items
    ]
    collection_md = collection.manifest_raw or build_collection_md(
        name=collection.name,
        slug=collection.slug,
        description=collection.description,
        version=collection.version or "1.0.0",
        tags=collection.tags,
        use_when=collection.use_when,
        visibility=collection.visibility,
        status=collection.status,
        selection=selection,
        extra=extra if extra else None,
    )
    items_yaml = build_items_yaml(parsed_items)
    folder = collection.slug or "collection"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{folder}/{REQUIRED_ENTRY}", collection_md)
        zf.writestr(f"{folder}/{ITEMS_FILE}", items_yaml)
    return buffer.getvalue()

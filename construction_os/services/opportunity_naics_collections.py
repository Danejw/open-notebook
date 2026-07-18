"""NAICS discovery profiles backed by the existing Collections system."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

from construction_os.database.repository import repo_query
from construction_os.domain.collection import Collection, CollectionItem
from construction_os.exceptions import InvalidInputError, NotFoundError

NAICS_COLLECTION_TAG = "opportunity-naics"
NAICS_DEFAULT_TAG = "opportunity-naics-default"
NAICS_ITEM_TYPE = "naics"
DEFAULT_NAICS_COLLECTION_SLUG = "construction-opportunities"

DEFAULT_CONSTRUCTION_NAICS: tuple[tuple[str, str, str], ...] = (
    (
        "236220",
        "Commercial and Institutional Building Construction",
        "General contractors building or renovating commercial and institutional facilities.",
    ),
    (
        "236210",
        "Industrial Building Construction",
        "General contractors building or renovating industrial facilities.",
    ),
    (
        "236118",
        "Residential Remodelers",
        "General contractors performing residential additions, alterations, and remodeling.",
    ),
)


def normalize_naics_code(value: Any) -> Optional[str]:
    """Return a valid 2-6 digit NAICS search code or ``None``."""

    text = re.sub(r"\D", "", str(value or ""))
    if not re.fullmatch(r"\d{2,6}", text):
        return None
    return text


def naics_code_from_item(item: CollectionItem) -> Optional[str]:
    """Read a NAICS code from an item without requiring a new collection model."""

    metadata = item.metadata or {}
    return normalize_naics_code(
        metadata.get("naics_code") or metadata.get("code") or item.item_id
    )


def extract_naics_entries(items: Iterable[CollectionItem]) -> List[Dict[str, Any]]:
    """Extract enabled, unique NAICS entries from ordinary Collection items."""

    entries: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not item.enabled or item.type != NAICS_ITEM_TYPE:
            continue
        code = naics_code_from_item(item)
        if not code or code in seen:
            continue
        seen.add(code)
        entries.append(
            {
                "code": code,
                "title": item.title,
                "description": item.description or "",
                "priority": item.priority,
                "item_id": item.item_id,
            }
        )
    return entries


def is_naics_collection(collection: Collection) -> bool:
    tags = {str(tag).strip().lower() for tag in collection.tags or []}
    selection = collection.selection or {}
    return (
        NAICS_COLLECTION_TAG in tags
        or str(selection.get("kind") or "").strip().lower() == NAICS_COLLECTION_TAG
    )


async def ensure_default_naics_collection() -> Collection:
    """Create the editable default construction discovery collection once."""

    rows = await repo_query(
        "SELECT * FROM collection WHERE slug = $slug LIMIT 1",
        {"slug": DEFAULT_NAICS_COLLECTION_SLUG},
    )
    if rows:
        return Collection(**rows[0])

    collection = Collection(
        name="Construction Opportunities",
        slug=DEFAULT_NAICS_COLLECTION_SLUG,
        description=(
            "NAICS codes used by the Opportunity Hub to discover general contracting "
            "and building construction opportunities. Edit or duplicate this collection "
            "to change what SAM.gov imports."
        ),
        tags=[NAICS_COLLECTION_TAG, NAICS_DEFAULT_TAG, "construction"],
        use_when=["Searching SAM.gov for construction opportunities"],
        status="active",
        visibility="instance",
        selection={"kind": NAICS_COLLECTION_TAG, "default": True},
    )
    await collection.save()
    if not collection.id:
        raise InvalidInputError("Default NAICS collection could not be created")

    for sort_order, (code, title, description) in enumerate(DEFAULT_CONSTRUCTION_NAICS):
        await CollectionItem(
            collection=collection.id,
            item_id=code,
            type=NAICS_ITEM_TYPE,
            title=f"{code} — {title}",
            description=description,
            tags=["naics", "construction"],
            topics=["opportunity-discovery"],
            authority="U.S. Census Bureau",
            enabled=True,
            priority=sort_order + 1,
            metadata={"naics_code": code},
            sort_order=sort_order,
        ).save()
    return collection


async def _eligible_naics_collections() -> List[Collection]:
    collections = await Collection.get_all(order_by="updated desc")
    return [
        collection
        for collection in collections
        if not collection.archived
        and collection.status == "active"
        and is_naics_collection(collection)
    ]


async def resolve_naics_collection(
    collection_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolve one selected Collection into a SAM.gov discovery profile."""

    collection: Optional[Collection] = None
    if collection_id:
        loaded = await Collection.get(collection_id)
        if not isinstance(loaded, Collection):
            raise NotFoundError(f"NAICS collection not found: {collection_id}")
        collection = loaded
        if collection.archived or collection.status != "active":
            raise InvalidInputError("The selected NAICS collection must be active")
        if not is_naics_collection(collection):
            raise InvalidInputError(
                f"Collection must use the '{NAICS_COLLECTION_TAG}' tag or selection kind"
            )
    else:
        eligible = await _eligible_naics_collections()
        defaults = [
            item
            for item in eligible
            if NAICS_DEFAULT_TAG
            in {str(tag).strip().lower() for tag in item.tags or []}
            or bool((item.selection or {}).get("default"))
        ]
        collection = defaults[0] if defaults else (eligible[0] if eligible else None)
        if collection is None:
            collection = await ensure_default_naics_collection()

    entries = extract_naics_entries(await collection.get_items())
    if not entries:
        raise InvalidInputError(
            "The selected NAICS collection has no enabled items with type 'naics'"
        )

    return {
        "id": collection.id or "",
        "name": collection.name,
        "slug": collection.slug,
        "description": collection.description,
        "codes": [entry["code"] for entry in entries],
        "items": entries,
        "is_default": NAICS_DEFAULT_TAG
        in {str(tag).strip().lower() for tag in collection.tags or []}
        or bool((collection.selection or {}).get("default")),
    }


async def list_naics_collection_profiles() -> List[Dict[str, Any]]:
    """List active Collections that can drive Opportunity Hub discovery."""

    if not await _eligible_naics_collections():
        await ensure_default_naics_collection()

    profiles: List[Dict[str, Any]] = []
    for collection in await _eligible_naics_collections():
        entries = extract_naics_entries(await collection.get_items())
        if not entries:
            continue
        profiles.append(
            {
                "id": collection.id or "",
                "name": collection.name,
                "slug": collection.slug,
                "description": collection.description,
                "codes": [entry["code"] for entry in entries],
                "items": entries,
                "is_default": NAICS_DEFAULT_TAG
                in {str(tag).strip().lower() for tag in collection.tags or []}
                or bool((collection.selection or {}).get("default")),
            }
        )
    profiles.sort(key=lambda item: (not item["is_default"], item["name"].lower()))
    return profiles

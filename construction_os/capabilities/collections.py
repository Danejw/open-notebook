"""list_collections / get_collection capabilities."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import require_project_session
from construction_os.capabilities.models import (
    CapabilityRuntimeContext,
    CatalogFilter,
)
from construction_os.capabilities.skills import _matches_catalog_filter
from construction_os.collections.loader import (
    get_collection_catalog,
    load_one_collection_block,
)
from construction_os.domain.collection import Collection


class ListCollectionsInput(CatalogFilter):
    pass


class ListCollectionsOutput(BaseModel):
    collections: list[dict[str, Any]] = Field(default_factory=list)


class GetCollectionInput(BaseModel):
    collection_id: str


class GetCollectionOutput(BaseModel):
    collection: dict[str, Any]


async def list_collections(
    ctx: CapabilityRuntimeContext,
    inputs: ListCollectionsInput | None = None,
) -> ListCollectionsOutput:
    await require_project_session(ctx)
    filters = inputs or ListCollectionsInput()
    catalog = await get_collection_catalog()
    enriched: list[dict[str, Any]] = []
    for item in catalog:
        coll = await Collection.get(str(item["id"]))
        use_when = list(coll.use_when or []) if coll else []
        row = {
            "id": item.get("id"),
            "name": item.get("name"),
            "description": item.get("description"),
            "tags": item.get("tags") or [],
            "status": item.get("status"),
            "item_count": item.get("item_count"),
            "use_when": use_when,
        }
        if filters.use_when:
            needle = filters.use_when.lower()
            if not any(needle in str(u).lower() for u in use_when):
                continue
        if filters.query:
            q = filters.query.lower()
            hay = " ".join(
                [
                    str(row.get("name") or ""),
                    str(row.get("description") or ""),
                    " ".join(str(t) for t in (row.get("tags") or [])),
                    " ".join(str(u) for u in use_when),
                ]
            ).lower()
            if q not in hay:
                continue
        # Reuse name/description/tags/status filters without re-applying query
        filter_copy = CatalogFilter(
            name=filters.name,
            description=filters.description,
            tags=filters.tags,
            status=filters.status,
        )
        if not _matches_catalog_filter(row, filter_copy):
            continue
        enriched.append(row)
    return ListCollectionsOutput(collections=enriched)


async def get_collection(
    ctx: CapabilityRuntimeContext,
    inputs: GetCollectionInput,
) -> GetCollectionOutput:
    await require_project_session(ctx)
    loaded = await load_one_collection_block(inputs.collection_id)
    if inputs.collection_id not in ctx.ephemeral_collection_ids:
        ctx.ephemeral_collection_ids.append(inputs.collection_id)
    return GetCollectionOutput(
        collection={
            "id": loaded["id"],
            "name": loaded["name"],
            "block": loaded["block"],
            "char_count": loaded.get("char_count"),
            "item_ids": loaded.get("item_ids") or [],
            "note": (
                "Loaded in the same format used for chat prompt injection. "
                "Not saved as a chat default."
            ),
        }
    )

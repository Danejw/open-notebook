"""Load collection content for chat context."""

from __future__ import annotations

from typing import Iterable, List

from construction_os.collections.standard import DEFAULT_MAX_ITEMS
from construction_os.domain.collection import Collection, CollectionItem
from construction_os.exceptions import InvalidInputError, NotFoundError


async def get_collection_catalog() -> list[dict]:
    """Lightweight catalog for pickers."""
    collections = await Collection.get_all(order_by="name asc")
    out: list[dict] = []
    for coll in collections:
        if coll.archived or coll.status == "archived":
            continue
        items = await coll.get_items()
        out.append(
            {
                "id": coll.id,
                "name": coll.name,
                "description": coll.description,
                "slug": coll.slug,
                "tags": coll.tags or [],
                "status": coll.status,
                "archived": coll.archived,
                "item_count": len(items),
            }
        )
    return out


def _max_items_for(collection: Collection) -> int:
    selection = collection.selection or {}
    raw = selection.get("max_items")
    if isinstance(raw, int) and raw > 0:
        return raw
    return DEFAULT_MAX_ITEMS


def _sort_items(items: list[CollectionItem]) -> list[CollectionItem]:
    return sorted(
        items,
        key=lambda i: (
            -(i.priority or 0),
            i.sort_order,
            i.title.lower(),
        ),
    )


async def load_one_collection_block(collection_id: str) -> dict:
    """Load a single collection manifest summary and enabled URL items."""
    collection = await Collection.get(collection_id)
    if not collection or collection.archived:
        raise NotFoundError(f"Collection not found: {collection_id}")

    all_items = await collection.get_items()
    enabled_url_items = [
        i
        for i in all_items
        if i.enabled and i.type == "url" and i.url
    ]
    capped = _sort_items(enabled_url_items)[: _max_items_for(collection)]

    use_when = collection.use_when or []
    tags = collection.tags or []
    lines = [
        f"## Collection: {collection.name}",
        "",
        f"**Description:** {collection.description}",
    ]
    if use_when:
        lines.append("**Use when:**")
        lines.extend(f"- {u}" for u in use_when)
    if tags:
        lines.append(f"**Tags:** {', '.join(tags)}")
    lines.append("")
    lines.append("**Reference items:**")
    if not capped:
        lines.append("- (no enabled URL items)")
    else:
        for item in capped:
            desc = f" — {item.description}" if item.description else ""
            lines.append(f"- **{item.title}** ({item.url}){desc}")

    block = "\n".join(lines)
    return {
        "id": collection.id,
        "name": collection.name,
        "block": block,
        "char_count": len(block),
        "item_ids": [i.item_id for i in capped],
    }


def format_collections_context(blocks: List[str]) -> str:
    """Wrap loaded collection blocks in the active-collections system prompt section."""
    if not blocks:
        return ""
    return (
        "# ACTIVE COLLECTIONS\n\n"
        "The user selected these curated reference collections. Use the listed URLs "
        "and descriptions as authoritative starting points when relevant. Prefer "
        "primary sources when noted. Do not fetch URLs automatically unless a tool "
        "is available; cite collection items by title and URL when used.\n\n"
        + "\n\n---\n\n".join(blocks)
    )


async def load_collection_context_blocks(collection_ids: Iterable[str]) -> str:
    """Load and format all selected collections for prompt injection."""
    blocks: List[str] = []
    for collection_id in collection_ids:
        loaded = await load_one_collection_block(collection_id)
        blocks.append(loaded["block"])
    return format_collections_context(blocks)

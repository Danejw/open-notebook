"""Knowledge graph integrity helpers (dangling edges, orphan detection)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

from construction_os.database.repository import ensure_record_id, repo_query


def dangling_relation_queries() -> Tuple[str, str]:
    """Read-only SurrealQL for dangling relation endpoints."""
    from_q = (
        "SELECT id, from_id, to_id, type, project_id, status FROM kg_relation "
        "WHERE from_id NOT IN (SELECT VALUE id FROM kg_entity)"
    )
    to_q = (
        "SELECT id, from_id, to_id, type, project_id, status FROM kg_relation "
        "WHERE to_id NOT IN (SELECT VALUE id FROM kg_entity)"
    )
    return from_q, to_q


def entity_still_has_support(
    supporting_ids: List[str], *, removed: str
) -> bool:
    """Return True if any supporting source remains after removing one."""
    removed_n = str(removed)
    return any(str(sid) != removed_n for sid in supporting_ids)


async def find_dangling_relations() -> Dict[str, List[Dict[str, Any]]]:
    """Return dangling relations keyed by endpoint side."""
    from_q, to_q = dangling_relation_queries()
    dangling_from = await repo_query(from_q) or []
    dangling_to = await repo_query(to_q) or []
    return {"from": dangling_from, "to": dangling_to}


async def deactivate_dangling_relations(
    *, dry_run: bool = False
) -> Dict[str, Any]:
    """
    Set status=inactive on relations whose endpoints are missing.

    Prefer deactivate over inventing placeholder entities.
    """
    found = await find_dangling_relations()
    ids: List[str] = []
    for row in found["from"] + found["to"]:
        rid = row.get("id")
        if rid is not None:
            ids.append(str(rid))
    # Dedupe
    unique_ids = list(dict.fromkeys(ids))
    if dry_run or not unique_ids:
        return {
            "dry_run": dry_run,
            "dangling_count": len(unique_ids),
            "deactivated": 0,
            "ids": unique_ids,
        }

    await repo_query(
        """
        UPDATE kg_relation SET status = "inactive"
        WHERE id IN $ids AND status = "active"
        """,
        {"ids": [ensure_record_id(i) for i in unique_ids]},
    )
    logger.info("Deactivated {} dangling kg_relation rows", len(unique_ids))
    return {
        "dry_run": False,
        "dangling_count": len(unique_ids),
        "deactivated": len(unique_ids),
        "ids": unique_ids,
    }


async def entity_has_remaining_edges(entity_id: str) -> bool:
    """True if any mention, claim, or active relation still references the entity."""
    eid = ensure_record_id(entity_id)
    mentions = await repo_query(
        "SELECT id FROM kg_mention WHERE entity_id = $id LIMIT 1",
        {"id": eid},
    )
    if mentions:
        return True
    claims = await repo_query(
        """
        SELECT id FROM kg_claim
        WHERE subject_id = $id OR object_id = $id
        LIMIT 1
        """,
        {"id": eid},
    )
    if claims:
        return True
    relations = await repo_query(
        """
        SELECT id FROM kg_relation
        WHERE (from_id = $id OR to_id = $id) AND status = "active"
        LIMIT 1
        """,
        {"id": eid},
    )
    return bool(relations)


async def prune_orphan_entities(
    project_id: str, *, dry_run: bool = False
) -> Dict[str, Any]:
    """
    Delete project entities with no supporting sources and no remaining edges.

    Safe cleanup after source release or extractor rewrite.
    """
    from construction_os.domain.knowledge_graph import supporting_source_ids_from_entity

    rows = await repo_query(
        "SELECT * FROM kg_entity WHERE project_id = $project_id",
        {"project_id": ensure_record_id(project_id)},
    )
    orphan_ids: List[str] = []
    for row in rows or []:
        eid = str(row.get("id") or "")
        if not eid:
            continue
        supporters = supporting_source_ids_from_entity(row)
        if supporters:
            continue
        if await entity_has_remaining_edges(eid):
            continue
        orphan_ids.append(eid)

    if dry_run or not orphan_ids:
        return {
            "dry_run": dry_run,
            "orphan_count": len(orphan_ids),
            "deleted": 0,
            "ids": orphan_ids,
        }

    await repo_query(
        "DELETE kg_entity WHERE id IN $ids",
        {"ids": [ensure_record_id(i) for i in orphan_ids]},
    )
    logger.info(
        "Pruned {} orphan kg_entity rows for project {}",
        len(orphan_ids),
        project_id,
    )
    return {
        "dry_run": False,
        "orphan_count": len(orphan_ids),
        "deleted": len(orphan_ids),
        "ids": orphan_ids,
    }

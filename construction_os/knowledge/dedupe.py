"""Scoped dedupe for project-wide KG entity twins (KG-011).

Never wipes kg_* tables. Dry-run by default; ``--apply`` merges one group at a time:
union supporting_sources, retarget mentions/claims/relations, delete extras only.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from loguru import logger

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.knowledge_graph import (
    PROJECT_WIDE_MERGE_TYPES,
    SUPPORTING_SOURCES_KEY,
    supporting_source_ids_from_entity,
)


def pick_survivor(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Prefer the row with the richest supporting_sources, then oldest ``created``.

    Stable tie-break on string id so dry-run/apply agree.
    """
    if not rows:
        raise ValueError("Cannot pick survivor from empty group")

    def sort_key(row: Dict[str, Any]) -> Tuple[int, str, str]:
        supporters = supporting_source_ids_from_entity(row)
        created = str(row.get("created") or "")
        rid = str(row.get("id") or "")
        # More supporters first → negate length; then oldest created; then id
        return (-len(supporters), created, rid)

    return sorted(rows, key=sort_key)[0]


def merge_supporting_sources_for_group(
    survivor: Dict[str, Any], duplicates: Sequence[Dict[str, Any]]
) -> Dict[str, Any]:
    """Union supporting_sources (and MERGED_FROM) onto survivor metadata."""
    meta = (
        dict(survivor.get("metadata"))
        if isinstance(survivor.get("metadata"), dict)
        else {}
    )
    supporters = supporting_source_ids_from_entity(survivor)
    merged_from = [str(s) for s in (meta.get("MERGED_FROM") or []) if s is not None]
    for dup in duplicates:
        for sid in supporting_source_ids_from_entity(dup):
            if sid not in supporters:
                supporters.append(sid)
        dup_meta = (
            dup.get("metadata") if isinstance(dup.get("metadata"), dict) else {}
        )
        for sid in dup_meta.get("MERGED_FROM") or []:
            s = str(sid) if sid is not None else ""
            if s and s not in merged_from:
                merged_from.append(s)
            if s and s not in supporters:
                supporters.append(s)
    meta[SUPPORTING_SOURCES_KEY] = supporters
    if merged_from:
        meta["MERGED_FROM"] = merged_from
    return meta


async def find_duplicate_entity_groups(
    *,
    project_id: Optional[str] = None,
    entity_types: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Groups with count>1 for project-wide identity (project_id, type, normalized_key).
    """
    types = list(entity_types) if entity_types else list(PROJECT_WIDE_MERGE_TYPES)
    vars: Dict[str, Any] = {"types": types}
    project_filter = ""
    if project_id:
        project_filter = " AND project_id = $project_id"
        vars["project_id"] = ensure_record_id(project_id)

    rows = await repo_query(
        f"""
        SELECT id, project_id, type, normalized_key FROM kg_entity
        WHERE type IN $types{project_filter}
        """,
        vars,
    )
    buckets: Dict[Tuple[str, str, str], List[str]] = {}
    for row in rows or []:
        key = (
            str(row.get("project_id") or ""),
            str(row.get("type") or ""),
            str(row.get("normalized_key") or ""),
        )
        rid = row.get("id")
        if rid is None:
            continue
        buckets.setdefault(key, []).append(str(rid))

    groups: List[Dict[str, Any]] = []
    for (pid, etype, nkey), ids in buckets.items():
        if len(ids) <= 1:
            continue
        groups.append(
            {
                "project_id": pid,
                "type": etype,
                "normalized_key": nkey,
                "count": len(ids),
                "ids": ids,
            }
        )
    groups.sort(key=lambda g: (-int(g["count"]), g["type"], g["normalized_key"]))
    return groups


async def _load_entities(ids: Sequence[str]) -> List[Dict[str, Any]]:
    if not ids:
        return []
    rows = await repo_query(
        "SELECT * FROM kg_entity WHERE id IN $ids",
        {"ids": [ensure_record_id(i) for i in ids]},
    )
    return list(rows or [])


async def _retarget_endpoint(
    *,
    table: str,
    field: str,
    from_ids: Sequence[str],
    to_id: str,
) -> int:
    if not from_ids:
        return 0
    await repo_query(
        f"UPDATE {table} SET {field} = $to_id WHERE {field} IN $from_ids",
        {
            "to_id": ensure_record_id(to_id),
            "from_ids": [ensure_record_id(i) for i in from_ids],
        },
    )
    return len(from_ids)


async def merge_duplicate_group(
    group: Dict[str, Any],
    *,
    dry_run: bool = True,
) -> Dict[str, Any]:
    """
    Merge one duplicate identity group onto a single survivor.

    Retargets kg_mention.entity_id, kg_claim subject/object, kg_relation from/to,
    then deletes non-survivor entity rows only.
    """
    ids = list(group.get("ids") or [])
    entities = await _load_entities(ids)
    if len(entities) < 2:
        return {
            "dry_run": dry_run,
            "skipped": True,
            "reason": "fewer_than_two_rows",
            "group": group,
        }

    survivor = pick_survivor(entities)
    survivor_id = str(survivor.get("id"))
    dupes = [e for e in entities if str(e.get("id")) != survivor_id]
    dupe_ids = [str(e.get("id")) for e in dupes]
    merged_meta = merge_supporting_sources_for_group(survivor, dupes)

    plan = {
        "dry_run": dry_run,
        "skipped": False,
        "survivor_id": survivor_id,
        "duplicate_ids": dupe_ids,
        "type": group.get("type"),
        "normalized_key": group.get("normalized_key"),
        "project_id": group.get("project_id"),
        "supporting_sources": merged_meta.get(SUPPORTING_SOURCES_KEY),
    }
    if dry_run:
        return plan

    await repo_query(
        "UPDATE $id SET metadata = $metadata",
        {
            "id": ensure_record_id(survivor_id),
            "metadata": merged_meta,
        },
    )
    await _retarget_endpoint(
        table="kg_mention", field="entity_id", from_ids=dupe_ids, to_id=survivor_id
    )
    await _retarget_endpoint(
        table="kg_claim", field="subject_id", from_ids=dupe_ids, to_id=survivor_id
    )
    await _retarget_endpoint(
        table="kg_claim", field="object_id", from_ids=dupe_ids, to_id=survivor_id
    )
    await _retarget_endpoint(
        table="kg_relation", field="from_id", from_ids=dupe_ids, to_id=survivor_id
    )
    await _retarget_endpoint(
        table="kg_relation", field="to_id", from_ids=dupe_ids, to_id=survivor_id
    )
    await repo_query(
        "DELETE kg_entity WHERE id IN $ids",
        {"ids": [ensure_record_id(i) for i in dupe_ids]},
    )
    plan["deleted"] = dupe_ids
    logger.info(
        "Merged {} '{}' in {} → survivor {} (deleted {})",
        group.get("type"),
        group.get("normalized_key"),
        group.get("project_id"),
        survivor_id,
        len(dupe_ids),
    )
    return plan


async def dedupe_project_wide_entities(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """Find and merge project-wide duplicate entity groups (KG-011)."""
    groups = await find_duplicate_entity_groups(project_id=project_id)
    if limit is not None:
        groups = groups[:limit]

    results: List[Dict[str, Any]] = []
    deleted_total = 0
    for group in groups:
        result = await merge_duplicate_group(group, dry_run=dry_run)
        results.append(result)
        if not dry_run and not result.get("skipped"):
            deleted_total += len(result.get("duplicate_ids") or [])

    remaining = await find_duplicate_entity_groups(project_id=project_id)
    return {
        "dry_run": dry_run,
        "project_id": project_id,
        "groups_found": len(groups),
        "groups_processed": len(results),
        "extra_nodes_removed": deleted_total if not dry_run else 0,
        "extra_nodes_would_remove": (
            sum(max(0, int(g.get("count") or 0) - 1) for g in groups) if dry_run else 0
        ),
        "remaining_duplicate_groups": len(remaining),
        "groups": results if dry_run else [
            {
                "survivor_id": r.get("survivor_id"),
                "duplicate_ids": r.get("duplicate_ids"),
                "type": r.get("type"),
                "normalized_key": r.get("normalized_key"),
            }
            for r in results
            if not r.get("skipped")
        ],
    }


async def duplicate_identity_metrics(
    *, project_id: Optional[str] = None
) -> Dict[str, Any]:
    """Read-only counts for KG-011 verification."""
    groups = await find_duplicate_entity_groups(project_id=project_id)
    by_type: Dict[str, int] = {}
    extra = 0
    for g in groups:
        t = str(g.get("type") or "")
        by_type[t] = by_type.get(t, 0) + 1
        extra += max(0, int(g.get("count") or 0) - 1)
    return {
        "duplicate_groups": len(groups),
        "extra_nodes": extra,
        "by_type": by_type,
    }

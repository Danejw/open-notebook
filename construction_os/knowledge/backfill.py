"""Backfill legacy KG ownership/provenance fields without wiping tables (KG-010)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from loguru import logger

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.knowledge_graph import (
    SUPPORTING_SOURCES_KEY,
    supporting_source_ids_from_entity,
)
from construction_os.knowledge.project_linker import LINKER_EXTRACTOR
from construction_os.knowledge.writer import find_text_offsets


def materialize_supporting_sources_metadata(
    entity: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Return updated metadata when ``supporting_sources`` should be materialized.

    Uses primary ``source_id``, existing ``supporting_sources``, and ``MERGED_FROM``.
    Returns None when no write is needed.
    """
    supporters = supporting_source_ids_from_entity(entity)
    if not supporters:
        return None
    meta = (
        dict(entity.get("metadata"))
        if isinstance(entity.get("metadata"), dict)
        else {}
    )
    current = [
        str(s) for s in (meta.get(SUPPORTING_SOURCES_KEY) or []) if s is not None
    ]
    if current == supporters:
        return None
    meta[SUPPORTING_SOURCES_KEY] = supporters
    return meta


def needs_derived_flag(relation: Dict[str, Any]) -> bool:
    """True when a project_linker relation lacks metadata.derived=true."""
    if str(relation.get("extractor") or "") != LINKER_EXTRACTOR:
        return False
    meta = relation.get("metadata") if isinstance(relation.get("metadata"), dict) else {}
    return meta.get("derived") is not True


async def backfill_supporting_sources(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """Materialize ``metadata.supporting_sources`` on legacy entities."""
    if project_id:
        rows = await repo_query(
            "SELECT id, source_id, metadata FROM kg_entity WHERE project_id = $project_id",
            {"project_id": ensure_record_id(project_id)},
        )
    else:
        rows = await repo_query("SELECT id, source_id, metadata FROM kg_entity")

    candidates: List[Dict[str, Any]] = []
    for row in rows or []:
        updated_meta = materialize_supporting_sources_metadata(row)
        if updated_meta is None:
            continue
        candidates.append({"id": str(row.get("id")), "metadata": updated_meta})
        if limit is not None and len(candidates) >= limit:
            break

    if dry_run or not candidates:
        return {
            "dry_run": dry_run,
            "scanned": len(rows or []),
            "would_update": len(candidates),
            "updated": 0,
        }

    updated = 0
    for item in candidates:
        await repo_query(
            "UPDATE $id SET metadata = $metadata",
            {
                "id": ensure_record_id(item["id"]),
                "metadata": item["metadata"],
            },
        )
        updated += 1

    logger.info("Backfilled supporting_sources on {} kg_entity rows", updated)
    return {
        "dry_run": False,
        "scanned": len(rows or []),
        "would_update": len(candidates),
        "updated": updated,
    }


async def backfill_mention_offsets(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """Fill missing mention char_start/char_end from chunk content when findable."""
    if project_id:
        rows = await repo_query(
            """
            SELECT id, text, chunk_id, char_start, char_end FROM kg_mention
            WHERE project_id = $project_id
              AND (char_start = NONE OR char_end = NONE)
              AND chunk_id != NONE
            """,
            {"project_id": ensure_record_id(project_id)},
        )
    else:
        rows = await repo_query(
            """
            SELECT id, text, chunk_id, char_start, char_end FROM kg_mention
            WHERE (char_start = NONE OR char_end = NONE)
              AND chunk_id != NONE
            """
        )

    updates: List[Dict[str, Any]] = []
    skipped_missing_chunk = 0
    skipped_not_found = 0
    chunk_cache: Dict[str, str] = {}

    for row in rows or []:
        chunk_id = row.get("chunk_id")
        if chunk_id is None:
            continue
        chunk_key = str(chunk_id)
        if chunk_key not in chunk_cache:
            chunk_rows = await repo_query(
                "SELECT content FROM source_embedding WHERE id = $id",
                {"id": ensure_record_id(chunk_key)},
            )
            content = ""
            if chunk_rows:
                content = str(chunk_rows[0].get("content") or "")
            chunk_cache[chunk_key] = content
        content = chunk_cache[chunk_key]
        if not content:
            skipped_missing_chunk += 1
            continue
        start, end = find_text_offsets(content, str(row.get("text") or ""))
        if start is None or end is None:
            skipped_not_found += 1
            continue
        updates.append(
            {"id": str(row.get("id")), "char_start": start, "char_end": end}
        )
        if limit is not None and len(updates) >= limit:
            break

    if dry_run or not updates:
        return {
            "dry_run": dry_run,
            "scanned": len(rows or []),
            "would_update": len(updates),
            "updated": 0,
            "skipped_missing_chunk": skipped_missing_chunk,
            "skipped_not_found": skipped_not_found,
        }

    updated = 0
    for item in updates:
        await repo_query(
            "UPDATE $id SET char_start = $char_start, char_end = $char_end",
            {
                "id": ensure_record_id(item["id"]),
                "char_start": item["char_start"],
                "char_end": item["char_end"],
            },
        )
        updated += 1

    logger.info("Backfilled char offsets on {} kg_mention rows", updated)
    return {
        "dry_run": False,
        "scanned": len(rows or []),
        "would_update": len(updates),
        "updated": updated,
        "skipped_missing_chunk": skipped_missing_chunk,
        "skipped_not_found": skipped_not_found,
    }


async def backfill_derived_relation_flags(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """Set metadata.derived=true on legacy project_linker relations."""
    if project_id:
        rows = await repo_query(
            """
            SELECT id, extractor, metadata FROM kg_relation
            WHERE project_id = $project_id AND extractor = $extractor
            """,
            {
                "project_id": ensure_record_id(project_id),
                "extractor": LINKER_EXTRACTOR,
            },
        )
    else:
        rows = await repo_query(
            """
            SELECT id, extractor, metadata FROM kg_relation
            WHERE extractor = $extractor
            """,
            {"extractor": LINKER_EXTRACTOR},
        )

    candidates: List[Dict[str, Any]] = []
    for row in rows or []:
        if not needs_derived_flag(row):
            continue
        meta = (
            dict(row.get("metadata"))
            if isinstance(row.get("metadata"), dict)
            else {}
        )
        meta["derived"] = True
        meta.setdefault("provenance", LINKER_EXTRACTOR)
        candidates.append({"id": str(row.get("id")), "metadata": meta})
        if limit is not None and len(candidates) >= limit:
            break

    if dry_run or not candidates:
        return {
            "dry_run": dry_run,
            "scanned": len(rows or []),
            "would_update": len(candidates),
            "updated": 0,
        }

    updated = 0
    for item in candidates:
        await repo_query(
            "UPDATE $id SET metadata = $metadata",
            {
                "id": ensure_record_id(item["id"]),
                "metadata": item["metadata"],
            },
        )
        updated += 1

    logger.info("Backfilled derived flag on {} kg_relation rows", updated)
    return {
        "dry_run": False,
        "scanned": len(rows or []),
        "would_update": len(candidates),
        "updated": updated,
    }


async def backfill_legacy_provenance(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run all KG-010 provenance backfills (no table wipes).

    Updates existing rows in place so Graph RAG / explainability see
    supporting_sources, mention offsets, and derived relation flags.
    """
    supporting = await backfill_supporting_sources(
        project_id=project_id, dry_run=dry_run, limit=limit
    )
    offsets = await backfill_mention_offsets(
        project_id=project_id, dry_run=dry_run, limit=limit
    )
    derived = await backfill_derived_relation_flags(
        project_id=project_id, dry_run=dry_run, limit=limit
    )
    return {
        "dry_run": dry_run,
        "project_id": project_id,
        "supporting_sources": supporting,
        "mention_offsets": offsets,
        "derived_relations": derived,
    }


async def provenance_metrics(
    *, project_id: Optional[str] = None
) -> Dict[str, Any]:
    """Read-only counts for KG-010 verification."""
    vars: Dict[str, Any] = {}
    project_filter = ""
    if project_id:
        project_filter = " AND project_id = $project_id"
        vars["project_id"] = ensure_record_id(project_id)

    entity_total = await repo_query(
        f"SELECT count() AS c FROM kg_entity WHERE true{project_filter} GROUP ALL",
        vars,
    )
    entity_ss = await repo_query(
        f"""
        SELECT count() AS c FROM kg_entity
        WHERE metadata.supporting_sources != NONE{project_filter}
        GROUP ALL
        """,
        vars,
    )
    mention_total = await repo_query(
        f"SELECT count() AS c FROM kg_mention WHERE true{project_filter} GROUP ALL",
        vars,
    )
    mention_off = await repo_query(
        f"""
        SELECT count() AS c FROM kg_mention
        WHERE char_start != NONE AND char_end != NONE{project_filter}
        GROUP ALL
        """,
        vars,
    )
    derived = await repo_query(
        f"""
        SELECT count() AS c FROM kg_relation
        WHERE extractor = $extractor
          AND metadata.derived = true{project_filter}
        GROUP ALL
        """,
        {**vars, "extractor": LINKER_EXTRACTOR},
    )
    dangling_from = await repo_query(
        """
        SELECT count() AS c FROM kg_relation
        WHERE status = "active" AND from_id NOT IN (SELECT VALUE id FROM kg_entity)
        GROUP ALL
        """
    )
    dangling_to = await repo_query(
        """
        SELECT count() AS c FROM kg_relation
        WHERE status = "active" AND to_id NOT IN (SELECT VALUE id FROM kg_entity)
        GROUP ALL
        """
    )

    def _c(rows: Any) -> int:
        if not rows:
            return 0
        return int(rows[0].get("c") or 0)

    return {
        "entities_total": _c(entity_total),
        "entities_with_supporting_sources": _c(entity_ss),
        "mentions_total": _c(mention_total),
        "mentions_with_offsets": _c(mention_off),
        "derived_linker_relations": _c(derived),
        "active_dangling_from": _c(dangling_from),
        "active_dangling_to": _c(dangling_to),
    }

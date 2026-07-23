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


async def _chunks_for_source(source_id: str) -> List[Dict[str, Any]]:
    """Load source_embedding rows for a source (field name is ``source``)."""
    rows = await repo_query(
        """
        SELECT id, content, order FROM source_embedding
        WHERE source = $source_id
        ORDER BY order ASC
        """,
        {"source_id": ensure_record_id(source_id)},
    )
    return rows or []


def _best_chunk_for_texts(
    chunks: List[Dict[str, Any]], texts: List[str]
) -> Optional[Dict[str, Any]]:
    """
    Prefer a chunk that matches the most probe texts; ties keep earlier order.

    Returns ``{"id", "char_start", "char_end"}`` using the first matching text
    for offsets when at least one probe hits.
    """
    probes = [t.strip() for t in texts if (t or "").strip()]
    if not chunks or not probes:
        return None
    best: Optional[Dict[str, Any]] = None
    best_hits = 0
    for chunk in chunks:
        content = str(chunk.get("content") or "")
        if not content:
            continue
        hits = 0
        first_span: Optional[tuple[int, int]] = None
        for probe in probes:
            start, end = find_text_offsets(content, probe)
            if start is None or end is None:
                continue
            hits += 1
            if first_span is None:
                first_span = (start, end)
        if hits > best_hits and first_span is not None:
            best_hits = hits
            best = {
                "id": str(chunk.get("id")),
                "char_start": first_span[0],
                "char_end": first_span[1],
                "hits": hits,
            }
            if hits >= len(probes):
                break
    return best


async def _label_map_for_ids(entity_ids: List[str]) -> Dict[str, str]:
    """Batch-load entity labels keyed by string id."""
    unique = list(dict.fromkeys(eid for eid in entity_ids if eid))
    out: Dict[str, str] = {}
    batch_size = 200
    for i in range(0, len(unique), batch_size):
        batch = unique[i : i + batch_size]
        rows = await repo_query(
            "SELECT id, label FROM kg_entity WHERE id IN $ids",
            {"ids": [ensure_record_id(eid) for eid in batch]},
        )
        for row in rows or []:
            eid = str(row.get("id") or "")
            label = str(row.get("label") or "").strip()
            if eid and label:
                out[eid] = label
    return out


async def _mention_chunk_index(
    *, project_id: Optional[str] = None
) -> Dict[tuple[str, str], str]:
    """Map (entity_id, source_id) -> chunk_id from mentions with chunks."""
    vars: Dict[str, Any] = {}
    project_filter = ""
    if project_id:
        project_filter = " AND project_id = $project_id"
        vars["project_id"] = ensure_record_id(project_id)
    rows = await repo_query(
        f"""
        SELECT entity_id, source_id, chunk_id FROM kg_mention
        WHERE chunk_id != NONE AND entity_id != NONE{project_filter}
        """,
        vars,
    )
    index: Dict[tuple[str, str], str] = {}
    for row in rows or []:
        eid = str(row.get("entity_id") or "")
        sid = str(row.get("source_id") or "")
        cid = str(row.get("chunk_id") or "")
        if eid and sid and cid and (eid, sid) not in index:
            index[(eid, sid)] = cid
    return index


async def _claim_chunk_index(
    *, project_id: Optional[str] = None
) -> Dict[tuple[str, str], str]:
    """Map (entity_id, source_id) -> chunk_id from claims with chunks."""
    vars: Dict[str, Any] = {}
    project_filter = ""
    if project_id:
        project_filter = " AND project_id = $project_id"
        vars["project_id"] = ensure_record_id(project_id)
    rows = await repo_query(
        f"""
        SELECT subject_id, object_id, source_id, chunk_id FROM kg_claim
        WHERE chunk_id != NONE{project_filter}
        """,
        vars,
    )
    index: Dict[tuple[str, str], str] = {}
    for row in rows or []:
        sid = str(row.get("source_id") or "")
        cid = str(row.get("chunk_id") or "")
        if not sid or not cid:
            continue
        for key in ("subject_id", "object_id"):
            eid = row.get(key)
            if eid is None:
                continue
            pair = (str(eid), sid)
            if pair not in index:
                index[pair] = cid
    return index


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
    """
    Fill missing mention chunk_id / char offsets from source embeddings (KG-014).

    - Mentions with chunk_id: locate text in that chunk (quote/ws tolerant).
    - Mentions without chunk_id: search ``source_embedding`` where ``source`` matches.
    - If assigned chunk lacks the text, fall back to other chunks for the source.
    """
    if project_id:
        rows = await repo_query(
            """
            SELECT id, text, source_id, chunk_id, char_start, char_end FROM kg_mention
            WHERE project_id = $project_id
              AND (char_start = NONE OR char_end = NONE OR chunk_id = NONE)
            """,
            {"project_id": ensure_record_id(project_id)},
        )
    else:
        rows = await repo_query(
            """
            SELECT id, text, source_id, chunk_id, char_start, char_end FROM kg_mention
            WHERE char_start = NONE OR char_end = NONE OR chunk_id = NONE
            """
        )

    updates: List[Dict[str, Any]] = []
    skipped_missing_chunk = 0
    skipped_not_found = 0
    skipped_no_source = 0
    source_chunk_cache: Dict[str, List[Dict[str, Any]]] = {}
    chunk_content_cache: Dict[str, str] = {}

    async def _content_for_chunk(chunk_id: str) -> str:
        if chunk_id in chunk_content_cache:
            return chunk_content_cache[chunk_id]
        chunk_rows = await repo_query(
            "SELECT content FROM source_embedding WHERE id = $id",
            {"id": ensure_record_id(chunk_id)},
        )
        content = str((chunk_rows or [{}])[0].get("content") or "") if chunk_rows else ""
        chunk_content_cache[chunk_id] = content
        return content

    for row in rows or []:
        text = str(row.get("text") or "").strip()
        source_id = row.get("source_id")
        if not text:
            skipped_not_found += 1
            continue

        chunk_id = str(row.get("chunk_id")) if row.get("chunk_id") is not None else None
        start: Optional[int] = None
        end: Optional[int] = None

        if chunk_id:
            content = await _content_for_chunk(chunk_id)
            if content:
                start, end = find_text_offsets(content, text)

        if (start is None or end is None) and source_id is not None:
            sid = str(source_id)
            if sid not in source_chunk_cache:
                source_chunk_cache[sid] = await _chunks_for_source(sid)
            best = _best_chunk_for_texts(source_chunk_cache[sid], [text])
            if best:
                chunk_id = best["id"]
                start = int(best["char_start"])
                end = int(best["char_end"])
            elif not source_chunk_cache[sid]:
                skipped_missing_chunk += 1
                continue
        elif source_id is None and (start is None or end is None):
            skipped_no_source += 1
            continue

        if chunk_id is None or start is None or end is None:
            skipped_not_found += 1
            continue

        updates.append(
            {
                "id": str(row.get("id")),
                "chunk_id": chunk_id,
                "char_start": start,
                "char_end": end,
            }
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
            "skipped_no_source": skipped_no_source,
        }

    updated = 0
    for item in updates:
        await repo_query(
            """
            UPDATE $id SET
              chunk_id = $chunk_id,
              char_start = $char_start,
              char_end = $char_end
            """,
            {
                "id": ensure_record_id(item["id"]),
                "chunk_id": ensure_record_id(item["chunk_id"]),
                "char_start": item["char_start"],
                "char_end": item["char_end"],
            },
        )
        updated += 1

    logger.info("Backfilled chunk/offsets on {} kg_mention rows", updated)
    return {
        "dry_run": False,
        "scanned": len(rows or []),
        "would_update": len(updates),
        "updated": updated,
        "skipped_missing_chunk": skipped_missing_chunk,
        "skipped_not_found": skipped_not_found,
        "skipped_no_source": skipped_no_source,
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


def _is_derived_relation(relation: Dict[str, Any]) -> bool:
    """True for linker-derived edges that may omit chunk_id by design."""
    if str(relation.get("extractor") or "") == LINKER_EXTRACTOR:
        return True
    meta = relation.get("metadata") if isinstance(relation.get("metadata"), dict) else {}
    return meta.get("derived") is True


async def backfill_relation_chunk_ids(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fill missing chunk_id on non-derived active relations (KG-013).

    Strategy:
    1. Mention/claim chunk on same source sharing from_id/to_id.
    2. Search ``source_embedding`` (``source`` field) for endpoint entity labels.
    """
    vars: Dict[str, Any] = {}
    project_filter = ""
    if project_id:
        project_filter = " AND project_id = $project_id"
        vars["project_id"] = ensure_record_id(project_id)

    rows = await repo_query(
        f"""
        SELECT id, from_id, to_id, source_id, extractor, metadata, chunk_id, status
        FROM kg_relation
        WHERE status = "active"
          AND chunk_id = NONE{project_filter}
        """,
        vars,
    )

    candidates = [r for r in (rows or []) if not _is_derived_relation(r)]
    skipped_derived = len(rows or []) - len(candidates)

    mention_idx = await _mention_chunk_index(project_id=project_id)
    claim_idx = await _claim_chunk_index(project_id=project_id)

    entity_ids: List[str] = []
    source_ids: List[str] = []
    for row in candidates:
        for eid in (row.get("from_id"), row.get("to_id")):
            if eid is not None:
                entity_ids.append(str(eid))
        if row.get("source_id") is not None:
            source_ids.append(str(row.get("source_id")))

    labels = await _label_map_for_ids(entity_ids)
    source_chunk_cache: Dict[str, List[Dict[str, Any]]] = {}
    for sid in dict.fromkeys(source_ids):
        source_chunk_cache[sid] = await _chunks_for_source(sid)

    updates: List[Dict[str, Any]] = []
    skipped_no_evidence = 0

    for row in candidates:
        from_id = str(row.get("from_id")) if row.get("from_id") is not None else None
        to_id = str(row.get("to_id")) if row.get("to_id") is not None else None
        source_id = (
            str(row.get("source_id")) if row.get("source_id") is not None else None
        )
        if from_id is None and to_id is None:
            skipped_no_evidence += 1
            continue

        chunk_id: Optional[str] = None
        if source_id:
            for eid in (from_id, to_id):
                if eid is None:
                    continue
                chunk_id = mention_idx.get((eid, source_id)) or claim_idx.get(
                    (eid, source_id)
                )
                if chunk_id:
                    break

        if chunk_id is None and source_id:
            probes = [
                labels[eid]
                for eid in (from_id, to_id)
                if eid is not None and eid in labels
            ]
            best = _best_chunk_for_texts(source_chunk_cache.get(source_id) or [], probes)
            if best:
                chunk_id = best["id"]

        if chunk_id is None:
            skipped_no_evidence += 1
            continue
        updates.append({"id": str(row.get("id")), "chunk_id": chunk_id})
        if limit is not None and len(updates) >= limit:
            break

    if dry_run or not updates:
        return {
            "dry_run": dry_run,
            "scanned": len(rows or []),
            "would_update": len(updates),
            "updated": 0,
            "skipped_derived": skipped_derived,
            "skipped_no_evidence": skipped_no_evidence,
        }

    updated = 0
    for item in updates:
        await repo_query(
            "UPDATE $id SET chunk_id = $chunk_id",
            {
                "id": ensure_record_id(item["id"]),
                "chunk_id": ensure_record_id(item["chunk_id"]),
            },
        )
        updated += 1

    logger.info("Backfilled chunk_id on {} kg_relation rows", updated)
    return {
        "dry_run": False,
        "scanned": len(rows or []),
        "would_update": len(updates),
        "updated": updated,
        "skipped_derived": skipped_derived,
        "skipped_no_evidence": skipped_no_evidence,
    }


async def backfill_legacy_provenance(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run provenance backfills (no table wipes).

    Updates existing rows in place so Graph RAG / explainability see
    supporting_sources, mention offsets, relation chunk_ids, and derived flags.
    """
    supporting = await backfill_supporting_sources(
        project_id=project_id, dry_run=dry_run, limit=limit
    )
    offsets = await backfill_mention_offsets(
        project_id=project_id, dry_run=dry_run, limit=limit
    )
    relation_chunks = await backfill_relation_chunk_ids(
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
        "relation_chunk_ids": relation_chunks,
        "derived_relations": derived,
    }


async def provenance_metrics(
    *, project_id: Optional[str] = None
) -> Dict[str, Any]:
    """Read-only counts for KG provenance verification."""
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
    rel_active = await repo_query(
        f"""
        SELECT count() AS c FROM kg_relation
        WHERE status = "active"{project_filter}
        GROUP ALL
        """,
        vars,
    )
    rel_with_chunk = await repo_query(
        f"""
        SELECT count() AS c FROM kg_relation
        WHERE status = "active" AND chunk_id != NONE{project_filter}
        GROUP ALL
        """,
        vars,
    )
    rel_missing_non_derived = await repo_query(
        f"""
        SELECT count() AS c FROM kg_relation
        WHERE status = "active"
          AND chunk_id = NONE
          AND (extractor != $extractor OR extractor = NONE)
          AND (metadata.derived = NONE OR metadata.derived = false){project_filter}
        GROUP ALL
        """,
        {**vars, "extractor": LINKER_EXTRACTOR},
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
        "active_relations": _c(rel_active),
        "active_relations_with_chunk": _c(rel_with_chunk),
        "non_derived_active_missing_chunk": _c(rel_missing_non_derived),
        "derived_linker_relations": _c(derived),
        "active_dangling_from": _c(dangling_from),
        "active_dangling_to": _c(dangling_to),
    }

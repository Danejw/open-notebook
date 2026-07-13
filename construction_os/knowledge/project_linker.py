"""Project-scoped cross-source reference linking for the knowledge graph."""

from __future__ import annotations

from typing import Any, Dict, Optional, Set, Tuple

from loguru import logger

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.knowledge_graph import (
    KnowledgeGraphRepository,
    normalize_entity_key,
)
from construction_os.knowledge.extractors.crossrefs import extract_crossrefs
from construction_os.knowledge.graph_projection import after_kg_write

LINKER_EXTRACTOR = "project_linker"
LINKER_VERSION = "1.0.0"
LINKER_CONFIDENCE = 0.85


async def _delete_linker_relations(project_id: str) -> None:
    await repo_query(
        """
        DELETE kg_relation
        WHERE project_id = $project_id AND extractor = $extractor
        """,
        {
            "project_id": ensure_record_id(project_id),
            "extractor": LINKER_EXTRACTOR,
        },
    )


async def _existing_relation_keys(project_id: str) -> Set[Tuple[str, str, str]]:
    rows = await repo_query(
        """
        SELECT type, from_id, to_id FROM kg_relation
        WHERE project_id = $project_id AND status = "active"
        """,
        {"project_id": ensure_record_id(project_id)},
    )
    keys: Set[Tuple[str, str, str]] = set()
    for row in rows or []:
        keys.add(
            (
                str(row.get("type") or "REFERENCES"),
                str(row.get("from_id")),
                str(row.get("to_id")),
            )
        )
    return keys


async def link_project_references(project_id: str) -> Dict[str, Any]:
    """
    Idempotently create REFERENCES edges from callout text across project sources.

    Strategy:
    1. Delete prior project_linker relations for this project.
    2. Index Reference/Specification entities by normalized_key.
    3. For each source full text, run deterministic crossref extraction.
    4. Resolve from/to labels to entity IDs; create missing REFERENCES edges.
    """
    repo = KnowledgeGraphRepository
    await _delete_linker_relations(project_id)

    entities = await repo_query(
        """
        SELECT * FROM kg_entity
        WHERE project_id = $project_id
          AND type IN ["Reference", "Specification", "Topic"]
        """,
        {"project_id": ensure_record_id(project_id)},
    ) or []

    by_key: Dict[str, Dict[str, Any]] = {}
    for ent in entities:
        key = str(ent.get("normalized_key") or normalize_entity_key(str(ent.get("label") or "")))
        if key and key not in by_key:
            by_key[key] = ent

    existing = await _existing_relation_keys(project_id)
    created = 0

    # Source texts for callout scanning
    sources = await repo_query(
        """
        SELECT id, full_text FROM source
        WHERE id IN (
            SELECT VALUE in FROM reference WHERE out = $project_id
        )
        """,
        {"project_id": ensure_record_id(project_id)},
    ) or []

    for src in sources:
        source_id = str(src.get("id") or "")
        text = src.get("full_text") or ""
        if not text:
            continue
        payload = extract_crossrefs(text)
        for rel in payload.relations:
            from_key = normalize_entity_key(rel.from_label)
            to_key = normalize_entity_key(rel.to_label)
            from_ent = by_key.get(from_key)
            to_ent = by_key.get(to_key)
            if not from_ent:
                from_ent_obj = await repo.upsert_entity(
                    project_id=project_id,
                    entity_type=rel.from_type or "Reference",
                    label=rel.from_label,
                    source_id=source_id,
                    extractor=LINKER_EXTRACTOR,
                    extractor_version=LINKER_VERSION,
                )
                from_ent = {"id": from_ent_obj.id, "normalized_key": from_key}
                by_key[from_key] = from_ent
            if not to_ent:
                to_ent_obj = await repo.upsert_entity(
                    project_id=project_id,
                    entity_type=rel.to_type or "Reference",
                    label=rel.to_label,
                    source_id=source_id,
                    extractor=LINKER_EXTRACTOR,
                    extractor_version=LINKER_VERSION,
                )
                to_ent = {"id": to_ent_obj.id, "normalized_key": to_key}
                by_key[to_key] = to_ent

            from_id = str(from_ent.get("id"))
            to_id = str(to_ent.get("id"))
            if not from_id or not to_id or from_id == to_id:
                continue
            rel_type = rel.type or "REFERENCES"
            key = (rel_type, from_id, to_id)
            if key in existing:
                continue
            await repo.create_relation(
                type=rel_type,
                from_id=from_id,
                to_id=to_id,
                project_id=project_id,
                source_id=source_id,
                confidence=LINKER_CONFIDENCE,
                status="active",
                extractor=LINKER_EXTRACTOR,
                extractor_version=LINKER_VERSION,
            )
            existing.add(key)
            created += 1

    if created:
        try:
            await after_kg_write(project_id)
        except Exception as e:
            logger.warning("after_kg_write following link pass failed: {}", e)

    logger.info(
        "Project linker project={} created_relations={}", project_id, created
    )
    return {"linker_relations_created": created}


async def link_project_references_safe(
    project_id: Optional[str],
) -> Dict[str, Any]:
    if not project_id:
        return {}
    return await link_project_references(project_id)

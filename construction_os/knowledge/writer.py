"""Persist extraction results into the knowledge graph tables."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from loguru import logger

from construction_os.domain.knowledge_graph import KnowledgeGraphRepository
from construction_os.knowledge.extractors.base import ExtractionResult
from construction_os.knowledge.graph_projection import after_kg_write


def _chunk_id_for_index(
    chunks: List[Dict[str, Any]], chunk_index: Optional[int]
) -> Optional[str]:
    if chunk_index is None or chunk_index < 0 or chunk_index >= len(chunks):
        return None
    return str(chunks[chunk_index].get("id") or "") or None


async def write_extraction_result(
    *,
    result: ExtractionResult,
    source_id: str,
    project_id: str,
    chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Idempotently replace projection for this extractor and write new rows."""
    repo = KnowledgeGraphRepository
    await repo.delete_extractor_projection(
        source_id=source_id,
        project_id=project_id,
        extractor=result.extractor,
    )

    entity_ids: Dict[str, str] = {}

    async def resolve(label: str, entity_type: str, metadata: Optional[Dict] = None):
        key = f"{entity_type}:{label.lower().strip()}"
        if key in entity_ids:
            return entity_ids[key]
        entity = await repo.upsert_entity(
            project_id=project_id,
            entity_type=entity_type or "Topic",
            label=label,
            source_id=source_id,
            metadata=metadata or {},
            extractor=result.extractor,
            extractor_version=result.extractor_version,
        )
        entity_ids[key] = str(entity.id)
        return entity_ids[key]

    for ent in result.payload.entities:
        await resolve(ent.label, ent.type, ent.metadata)

    for mention in result.payload.mentions:
        entity_id = await resolve(mention.text, mention.entity_type_hint or "Topic")
        await repo.create_mention(
            text=mention.text,
            entity_type_hint=mention.entity_type_hint,
            entity_id=entity_id,
            project_id=project_id,
            source_id=source_id,
            chunk_id=_chunk_id_for_index(chunks, mention.chunk_index),
            confidence=mention.confidence,
            extractor=result.extractor,
            extractor_version=result.extractor_version,
        )

    for claim in result.payload.claims:
        subject_id = await resolve(claim.subject_label, claim.subject_type or "Topic")
        object_id = None
        if claim.object_label:
            object_id = await resolve(
                claim.object_label, claim.object_type or "Topic"
            )
        await repo.create_claim(
            subject_id=subject_id,
            predicate=claim.predicate,
            object_id=object_id,
            object_literal=claim.object_literal,
            status="active",
            confidence=claim.confidence,
            project_id=project_id,
            source_id=source_id,
            chunk_id=_chunk_id_for_index(chunks, claim.chunk_index),
            extractor=result.extractor,
            extractor_version=result.extractor_version,
        )

    for relation in result.payload.relations:
        from_id = await resolve(relation.from_label, relation.from_type or "Topic")
        to_id = await resolve(relation.to_label, relation.to_type or "Topic")
        await repo.create_relation(
            type=relation.type or "REFERENCES",
            from_id=from_id,
            to_id=to_id,
            project_id=project_id,
            source_id=source_id,
            chunk_id=_chunk_id_for_index(chunks, relation.chunk_index),
            confidence=relation.confidence,
            status="active",
            extractor=result.extractor,
            extractor_version=result.extractor_version,
        )

    stats = {
        **result.stats,
        "entities": len(result.payload.entities),
        "mentions": len(result.payload.mentions),
        "claims": len(result.payload.claims),
        "relations": len(result.payload.relations),
        "entities_resolved": len(entity_ids),
    }
    logger.info(
        "Wrote KG projection extractor={} source={} project={} stats={}",
        result.extractor,
        source_id,
        project_id,
        stats,
    )
    try:
        await after_kg_write(project_id)
    except Exception as e:
        logger.warning("Failed to bump graph version/communities for {}: {}", project_id, e)
    return stats

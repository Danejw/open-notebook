"""Publish drawing entities/relationships into the existing knowledge graph."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List

from loguru import logger

from construction_os.drawing.config import EXTRACTOR_ID, EXTRACTOR_VERSION
from construction_os.drawing.types import DrawingItemDraft, DrawingRelationshipDraft
from construction_os.knowledge.extractors.base import (
    ExtractedEntity,
    ExtractedRelation,
    ExtractionPayload,
    ExtractionResult,
)
from construction_os.knowledge.writer import write_extraction_result


def items_to_extraction_result(
    items: List[DrawingItemDraft],
    relationships: List[DrawingRelationshipDraft],
    *,
    run_id: str,
) -> ExtractionResult:
    entities: List[ExtractedEntity] = []
    relations: List[ExtractedRelation] = []

    type_map = {
        "room": "Space",
        "finish": "Material",
        "note": "Note",
        "fixture": "Equipment",
        "equipment": "Equipment",
        "callout": "Reference",
        "metadata_field": "DrawingMetadata",
        "dimension": "Dimension",
        "grid": "Grid",
        "symbol": "Symbol",
        "schedule": "Schedule",
        "detail": "Detail",
        "view": "View",
        "revision": "Revision",
        "door": "Door",
        "window": "Window",
        "wall": "Wall",
    }

    for item in items:
        label = item.label or item.stable_id
        entity_type = type_map.get(item.item_type, "DrawingItem")
        entities.append(
            ExtractedEntity(
                type=entity_type,
                label=str(label),
                metadata={
                    "stable_id": item.stable_id,
                    "item_type": item.item_type,
                    "subtype": item.subtype,
                    "properties": item.properties,
                    "page_index": item.page_index,
                    "bbox_norm": item.bbox_norm.model_dump() if item.bbox_norm else None,
                    "confidence": item.confidence,
                    "confidence_band": item.confidence_band,
                    "extraction_run_id": run_id,
                    "extraction_method": item.extraction_method,
                    "raw_text": item.raw_text,
                },
            )
        )

    for rel in relationships:
        if not (rel.from_label or rel.from_item_id) or not (
            rel.to_label or rel.to_item_id
        ):
            continue
        relations.append(
            ExtractedRelation(
                type=rel.relationship_type,
                from_label=str(rel.from_label or rel.from_item_id),
                from_type="DrawingItem",
                to_label=str(rel.to_label or rel.to_item_id),
                to_type="DrawingItem",
                confidence=rel.confidence,
            )
        )

    sheet_labels = [
        i
        for i in items
        if i.item_type == "metadata_field" and i.subtype == "sheet_number"
    ]
    if sheet_labels:
        sheet_label = str(
            (sheet_labels[0].properties or {}).get("value") or sheet_labels[0].label
        )
        entities.append(
            ExtractedEntity(
                type="Sheet",
                label=f"Sheet {sheet_label}",
                metadata={"extraction_run_id": run_id, "sheet_number": sheet_label},
            )
        )
        for item in items:
            if item.item_type == "room":
                relations.append(
                    ExtractedRelation(
                        type="located_on",
                        from_label=str(item.label or item.stable_id),
                        from_type="Space",
                        to_label=f"Sheet {sheet_label}",
                        to_type="Sheet",
                        confidence=0.85,
                    )
                )

    payload = ExtractionPayload(entities=entities, relations=relations)
    digest = hashlib.sha256(
        json.dumps(
            {"run_id": run_id, "n": len(entities), "r": len(relations)},
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    return ExtractionResult(
        extractor=EXTRACTOR_ID,
        extractor_version=EXTRACTOR_VERSION,
        payload=payload,
        content_hash=digest,
        stats={"entities": len(entities), "relations": len(relations)},
    )


async def publish_drawing_knowledge_graph(
    *,
    items: List[DrawingItemDraft],
    relationships: List[DrawingRelationshipDraft],
    source_id: str,
    project_id: str,
    run_id: str,
) -> Dict[str, Any]:
    """Write drawing KG projection without deleting generic extractor output."""
    result = items_to_extraction_result(items, relationships, run_id=run_id)
    if not result.payload.entities and not result.payload.relations:
        return {"entities": 0, "relations": 0}

    stats = await write_extraction_result(
        result=result,
        source_id=source_id,
        project_id=project_id,
        chunks=[],
    )
    logger.info("Published drawing KG for run {}: {}", run_id, stats)
    return stats

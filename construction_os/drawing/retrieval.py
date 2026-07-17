"""Drawing evidence retrieval (off / shadow / on)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from loguru import logger

from construction_os.drawing import repository as drawing_repo
from construction_os.drawing.config import get_drawing_retrieval_mode
from construction_os.retrieval.types import EvidenceItem
from construction_os.utils.embedding import generate_embedding


async def retrieve_drawing_evidence(
    query: str,
    *,
    project_id: Optional[str],
    limit: int = 10,
    minimum_score: float = 0.15,
) -> List[EvidenceItem]:
    """Search active drawing embeddings for a project."""
    if not project_id or not query.strip():
        return []

    try:
        query_emb = await generate_embedding(query)
    except Exception as exc:
        logger.debug("Drawing retrieval embedding failed: {}", exc)
        return []

    rows = await drawing_repo.search_drawing_embeddings(
        project_id=project_id,
        query_embedding=query_emb,
        limit=limit,
        minimum_score=minimum_score,
    )

    items: List[EvidenceItem] = []
    for row in rows:
        band = None
        # Prefer verified / high confidence
        conf = float(row.get("confidence") or 0.0)
        verification = str(row.get("verification_status") or "")
        if verification in {"rejected", "unsupported"}:
            continue
        if conf < 0.5 and verification != "verified":
            # Allow medium with label via raw
            pass

        sheet = row.get("sheet_number")
        title = row.get("record_type")
        display = f"{sheet or ''} {title or ''}".strip() or "Drawing evidence"
        raw = dict(row)
        raw["drawing"] = True
        raw["sheet_number"] = sheet
        raw["page_id"] = str(row.get("page_id") or "")
        raw["region_id"] = str(row.get("region_id") or "") if row.get("region_id") else None
        raw["bbox_norm"] = None
        raw["evidence_crop"] = row.get("image_path")
        raw["extraction_confidence"] = conf
        raw["verification_status"] = verification
        raw["item_ids"] = row.get("item_ids") or []
        if conf < 0.8:
            raw["confidence_label"] = "medium_confidence"

        items.append(
            EvidenceItem(
                id=str(row.get("id") or ""),
                parent_id=str(row.get("source_id") or "") or None,
                title=display,
                score=float(row.get("similarity") or 0.0),
                matches=[row.get("content")],
                content=row.get("content"),
                source="drawing",  # type: ignore[arg-type]
                raw=raw,
            )
        )
    return items


async def maybe_merge_drawing_evidence(
    *,
    query: str,
    project_id: Optional[str],
    existing_items: List[EvidenceItem],
    limit: int,
) -> tuple[List[EvidenceItem], Optional[str]]:
    """
    Apply DRAWING_RAG_MODE.

    Returns (items, fallback_reason_or_shadow_note).
    """
    mode = get_drawing_retrieval_mode()
    if mode == "off":
        return existing_items, None

    drawing_items = await retrieve_drawing_evidence(
        query, project_id=project_id, limit=limit
    )
    if mode == "shadow":
        logger.info(
            "Drawing RAG shadow: base={} drawing={}",
            len(existing_items),
            len(drawing_items),
        )
        return existing_items, "drawing_shadow_mode"

    if not drawing_items:
        return existing_items, "drawing_empty"

    # Prefer verified/high-confidence first, then by score
    def sort_key(item: EvidenceItem) -> tuple:
        conf = float(item.raw.get("extraction_confidence") or 0)
        return (conf >= 0.8, item.score)

    drawing_sorted = sorted(drawing_items, key=sort_key, reverse=True)
    merged = list(existing_items)
    seen = {f"{i.id}|{i.parent_id}" for i in merged}
    for item in drawing_sorted:
        key = f"{item.id}|{item.parent_id}"
        if key in seen:
            continue
        merged.append(item)
        seen.add(key)
        if len(merged) >= limit:
            break
    return merged[:limit], None

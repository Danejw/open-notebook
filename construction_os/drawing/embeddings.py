"""Drawing-specific embeddings (coexist with source_embedding)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from loguru import logger

from construction_os.drawing import repository as drawing_repo
from construction_os.utils.embedding import generate_embeddings


async def publish_drawing_embeddings(
    *,
    run_id: str,
    source_id: str,
    project_id: Optional[str],
    semantic_records: List[Dict[str, Any]],
    embedding_model_hint: str,
) -> Dict[str, Any]:
    """Embed semantic drawing records into drawing_embedding table."""
    if not semantic_records:
        return {"embedded": 0}

    texts = [str(r.get("content") or "") for r in semantic_records]
    # Filter empties but keep alignment via indices
    nonempty_idx = [i for i, t in enumerate(texts) if t.strip()]
    if not nonempty_idx:
        return {"embedded": 0}

    try:
        vectors = await generate_embeddings([texts[i] for i in nonempty_idx])
    except Exception as exc:
        logger.error("Drawing embedding generation failed: {}", exc)
        raise

    embedded = 0
    for vec, idx in zip(vectors, nonempty_idx):
        rec = semantic_records[idx]
        await drawing_repo.create_embedding(
            {
                "run_id": run_id,
                "project_id": project_id,
                "source_id": source_id,
                "page_id": rec.get("page_id"),
                "region_id": rec.get("region_id"),
                "semantic_record_id": rec.get("id"),
                "item_ids": rec.get("item_ids") or [],
                "content": rec.get("content"),
                "record_type": rec.get("record_type"),
                "discipline": rec.get("discipline"),
                "sheet_number": rec.get("sheet_number"),
                "drawing_type": rec.get("drawing_type"),
                "confidence": rec.get("confidence"),
                "verification_status": rec.get("verification_status"),
                "embedding_model": embedding_model_hint,
                "embedding": vec,
                "image_path": rec.get("evidence_crop"),
            }
        )
        embedded += 1

    return {"embedded": embedded}

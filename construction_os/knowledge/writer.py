"""Persist extraction results into the knowledge graph tables."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

from construction_os.domain.knowledge_graph import KnowledgeGraphRepository
from construction_os.knowledge.extractors.base import ExtractionResult
from construction_os.knowledge.graph_projection import after_kg_write
from construction_os.knowledge.integrity import prune_orphan_entities

_WS_RE = re.compile(r"\s+")
_CURLY_QUOTES = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00a0": " ",
    }
)


def _chunk_id_for_index(
    chunks: List[Dict[str, Any]], chunk_index: Optional[int]
) -> Optional[str]:
    if chunk_index is None or chunk_index < 0 or chunk_index >= len(chunks):
        return None
    return str(chunks[chunk_index].get("id") or "") or None


def _normalize_quote_ws(value: str) -> str:
    """Normalize curly quotes/nbsp then collapse whitespace."""
    return _WS_RE.sub(" ", (value or "").translate(_CURLY_QUOTES)).strip()


def find_text_offsets(
    content: str, text: str
) -> Tuple[Optional[int], Optional[int]]:
    """
    Best-effort char offsets of ``text`` within ``content`` (KG-006 / KG-014).

    Tries exact match, case-insensitive, quote-normalized, then whitespace-normalized.
    """
    haystack = content or ""
    needle = (text or "").strip()
    if not haystack or not needle:
        return None, None

    pos = haystack.find(needle)
    if pos >= 0:
        return pos, pos + len(needle)

    lower_h = haystack.lower()
    lower_n = needle.lower()
    pos = lower_h.find(lower_n)
    if pos >= 0:
        return pos, pos + len(needle)

    # Curly quotes / nbsp (common in PDF extracts)
    quoted_h = haystack.translate(_CURLY_QUOTES)
    quoted_n = needle.translate(_CURLY_QUOTES)
    pos = quoted_h.lower().find(quoted_n.lower())
    if pos >= 0:
        return pos, pos + len(needle)

    # Whitespace-collapsed match (OCR / cross-chunk quirks)
    norm_h = _normalize_quote_ws(haystack)
    norm_n = _normalize_quote_ws(needle)
    if not norm_n:
        return None, None
    pos = norm_h.lower().find(norm_n.lower())
    if pos < 0:
        return None, None
    orig_pos = _map_collapsed_offset(quoted_h, pos)
    if orig_pos is None:
        return None, None
    return orig_pos, orig_pos + len(needle)


def _map_collapsed_offset(original: str, collapsed_pos: int) -> Optional[int]:
    """Map an index in whitespace-collapsed text back to the original string."""
    if collapsed_pos < 0:
        return None
    oi = 0
    ci = 0
    n = len(original)
    while oi < n and ci < collapsed_pos:
        if original[oi].isspace():
            # Skip run of whitespace that collapses to one space in norm
            while oi < n and original[oi].isspace():
                oi += 1
            ci += 1
            continue
        oi += 1
        ci += 1
    if ci == collapsed_pos:
        return oi
    return None


def find_chunk_index_for_text(
    chunks: List[Dict[str, Any]], text: str
) -> Optional[int]:
    """Return the first chunk index containing ``text`` (best-effort)."""
    needle = (text or "").strip()
    if not needle or not chunks:
        return None
    for i, chunk in enumerate(chunks):
        start, end = find_text_offsets(str(chunk.get("content") or ""), needle)
        if start is not None and end is not None:
            return i
    return None


def _offsets_in_chunk(
    chunks: List[Dict[str, Any]],
    chunk_index: Optional[int],
    text: str,
) -> Tuple[Optional[int], Optional[int]]:
    """Best-effort char offsets of ``text`` within the chunk content (KG-006)."""
    if chunk_index is None or chunk_index < 0 or chunk_index >= len(chunks):
        return None, None
    return find_text_offsets(str(chunks[chunk_index].get("content") or ""), text)


def _resolve_chunk_index(
    chunks: List[Dict[str, Any]],
    chunk_index: Optional[int],
    *texts: str,
) -> Optional[int]:
    """Keep explicit chunk_index; else locate the first matching probe text."""
    if chunk_index is not None and 0 <= chunk_index < len(chunks):
        return chunk_index
    for text in texts:
        found = find_chunk_index_for_text(chunks, text)
        if found is not None:
            return found
    return None


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
        chunk_index = _resolve_chunk_index(chunks, mention.chunk_index, mention.text)
        char_start = mention.char_start
        char_end = mention.char_end
        if char_start is None or char_end is None:
            char_start, char_end = _offsets_in_chunk(chunks, chunk_index, mention.text)
        await repo.create_mention(
            text=mention.text,
            entity_type_hint=mention.entity_type_hint,
            entity_id=entity_id,
            project_id=project_id,
            source_id=source_id,
            chunk_id=_chunk_id_for_index(chunks, chunk_index),
            char_start=char_start,
            char_end=char_end,
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
        chunk_index = _resolve_chunk_index(
            chunks,
            claim.chunk_index,
            claim.subject_label,
            claim.object_label or "",
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
            chunk_id=_chunk_id_for_index(chunks, chunk_index),
            extractor=result.extractor,
            extractor_version=result.extractor_version,
        )

    for relation in result.payload.relations:
        from_id = await resolve(relation.from_label, relation.from_type or "Topic")
        to_id = await resolve(relation.to_label, relation.to_type or "Topic")
        # Prefer explicit index; else locate from/to labels in chunks (KG-013)
        chunk_index = _resolve_chunk_index(
            chunks,
            relation.chunk_index,
            relation.from_label,
            relation.to_label,
        )
        await repo.create_relation(
            type=relation.type or "REFERENCES",
            from_id=from_id,
            to_id=to_id,
            project_id=project_id,
            source_id=source_id,
            chunk_id=_chunk_id_for_index(chunks, chunk_index),
            confidence=relation.confidence,
            status="active",
            extractor=result.extractor,
            extractor_version=result.extractor_version,
            metadata={"derived": False},
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
    try:
        await prune_orphan_entities(project_id, dry_run=False)
    except Exception as e:
        logger.warning("Failed to prune orphan KG entities for {}: {}", project_id, e)
    return stats

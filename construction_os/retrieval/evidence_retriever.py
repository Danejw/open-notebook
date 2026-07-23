"""Evidence retriever: vector, hybrid, and graph-aware retrieval for Ask/Search."""

from __future__ import annotations

import asyncio
import os
import re
import time
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

from construction_os.domain.project import text_search, vector_search
from construction_os.retrieval.types import (
    EvidenceBundle,
    EvidenceItem,
    EvidencePath,
    RetrievalMode,
)
from construction_os.utils.embedding_health import get_cached_embedding_dimension_warning

# Identifier-ish patterns that benefit from lexical (BM25) recall.
_IDENTIFIER_RE = re.compile(
    r"("
    r"\b[A-Z]{1,3}-\d+[A-Z]?\b|"  # sheet / equipment tags e.g. A-501, AHU-2
    r"\b\d{2}\s+\d{2}\s+\d{2}\b|"  # CSI section e.g. 09 30 00
    r"\b\d{2}\.\d{2}\.\d{2}\b|"
    r'"[^"]+"|'  # quoted phrases
    r"\bSEE\s+\d+/[A-Z]-?\d+\b|"
    r"\bRFI[-\s]?\d+\b|"
    r"\bsubmittal\b"
    r")",
    re.IGNORECASE,
)

_RRF_K = 60
_GRAPH_TIMEOUT_SECONDS = 2.0
_GRAPH_MAX_HOPS = 2
_GRAPH_MAX_NODES = 50
_GRAPH_MIN_CONFIDENCE = 0.5


async def _merge_drawing_evidence(
    *,
    query: str,
    project_id: Optional[str],
    existing_items: List[EvidenceItem],
    limit: int,
) -> tuple[List[EvidenceItem], Optional[str]]:
    """Lazy-import drawing retrieval to avoid circular imports with domain/AI."""
    from construction_os.drawing.retrieval import maybe_merge_drawing_evidence

    return await maybe_merge_drawing_evidence(
        query=query,
        project_id=project_id,
        existing_items=existing_items,
        limit=limit,
    )


def get_graph_rag_mode() -> str:
    """Return CONSTRUCTION_OS_GRAPH_RAG_MODE: off | shadow | on."""
    return os.getenv("CONSTRUCTION_OS_GRAPH_RAG_MODE", "off").strip().lower()


def should_use_hybrid(query: str) -> bool:
    """Heuristic: identifier / quoted / CSI / sheet-style queries prefer hybrid."""
    return bool(_IDENTIFIER_RE.search(query or ""))


def reciprocal_rank_fusion(
    ranked_lists: Sequence[Sequence[EvidenceItem]],
    *,
    k: int = _RRF_K,
) -> List[EvidenceItem]:
    """Fuse ranked lists with Reciprocal Rank Fusion; dedupe by id+parent_id."""
    scores: Dict[str, float] = {}
    best: Dict[str, EvidenceItem] = {}

    for ranked in ranked_lists:
        for rank, item in enumerate(ranked, start=1):
            key = f"{item.id}|{item.parent_id or ''}"
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
            existing = best.get(key)
            if existing is None or item.score > existing.score:
                best[key] = item

    ordered_keys = sorted(scores.keys(), key=lambda key: scores[key], reverse=True)
    fused: List[EvidenceItem] = []
    for key in ordered_keys:
        item = best[key].model_copy(deep=True)
        item.score = scores[key]
        fused.append(item)
    return fused


def _result_to_item(result: Dict[str, Any], source: str) -> EvidenceItem:
    score = float(
        result.get("similarity")
        or result.get("relevance")
        or result.get("score")
        or 0.0
    )
    matches = result.get("matches") or []
    if not matches and result.get("content") is not None:
        matches = [result.get("content")]

    def _opt_int(key: str) -> Optional[int]:
        raw = result.get(key)
        if raw is None:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    chunk_id = result.get("chunk_id")
    return EvidenceItem(
        id=str(result.get("id") or ""),
        parent_id=str(result["parent_id"]) if result.get("parent_id") else None,
        title=result.get("title"),
        score=score,
        matches=matches if isinstance(matches, list) else [matches],
        content=result.get("content"),
        source=source,  # type: ignore[arg-type]
        raw=dict(result),
        chunk_id=str(chunk_id) if chunk_id is not None else None,
        char_start=_opt_int("char_start"),
        char_end=_opt_int("char_end"),
        page=_opt_int("page"),
    )


async def _vector_items(
    query: str,
    *,
    limit: int,
    project_id: Optional[str],
    search_sources: bool,
    search_notes: bool,
    minimum_score: float,
) -> List[EvidenceItem]:
    results = await vector_search(
        query,
        limit,
        search_sources,
        search_notes,
        minimum_score=minimum_score,
        project_id=project_id,
    )
    return [_result_to_item(r, "vector") for r in (results or [])]


async def _text_items(
    query: str,
    *,
    limit: int,
    project_id: Optional[str],
    search_sources: bool,
    search_notes: bool,
) -> List[EvidenceItem]:
    results = await text_search(
        query,
        limit,
        search_sources,
        search_notes,
        project_id=project_id,
    )
    return [_result_to_item(r, "text") for r in (results or [])]


async def _graph_expand(
    query: str,
    *,
    project_id: Optional[str],
    seed_items: List[EvidenceItem],
    limit: int,
) -> tuple[List[EvidenceItem], List[EvidencePath]]:
    """Seed + bounded graph expansion. Safe no-op when KG tables are empty."""
    if not project_id:
        return [], []

    try:
        from construction_os.domain.knowledge_graph import (
            expand_from_seeds,
            seed_entities_for_query,
        )
    except ImportError:
        return [], []

    start = time.monotonic()
    try:
        seed_entities = await asyncio.wait_for(
            seed_entities_for_query(query, project_id=project_id, limit=20),
            timeout=_GRAPH_TIMEOUT_SECONDS,
        )
        if not seed_entities and not seed_items:
            return [], []

        items, paths = await asyncio.wait_for(
            expand_from_seeds(
                seed_entities,
                project_id=project_id,
                max_hops=_GRAPH_MAX_HOPS,
                max_nodes=_GRAPH_MAX_NODES,
                min_confidence=_GRAPH_MIN_CONFIDENCE,
                limit=limit,
            ),
            timeout=max(0.1, _GRAPH_TIMEOUT_SECONDS - (time.monotonic() - start)),
        )
        return items, paths
    except asyncio.TimeoutError:
        logger.warning("Graph expansion timed out; falling back")
        return [], []
    except Exception as e:
        logger.debug(f"Graph expansion skipped: {e}")
        return [], []


def _resolve_mode(query: str, mode: RetrievalMode) -> RetrievalMode:
    if mode != "auto":
        return mode
    graph_mode = get_graph_rag_mode()
    if graph_mode == "on":
        return "graph"
    if should_use_hybrid(query):
        return "hybrid"
    return "vector"


async def retrieve(
    query: str,
    *,
    project_id: Optional[str] = None,
    mode: RetrievalMode = "auto",
    limit: int = 10,
    search_sources: bool = True,
    search_notes: bool = True,
    minimum_score: float = 0.2,
) -> EvidenceBundle:
    """
    Retrieve ranked evidence for a query.

    Modes:
    - vector: dense similarity only
    - hybrid: BM25 + vector with RRF
    - graph: hybrid seeds + bounded KG expansion
    - auto: hybrid for identifier queries; graph when GRAPH_RAG_MODE=on
    """
    if not query or not query.strip():
        return EvidenceBundle(retrieval_mode_used="vector", fallback_reason="empty_query")

    # Query-path dim drift warn (cached); surfaces beyond Advanced rebuild UI.
    dim_warning = await get_cached_embedding_dimension_warning()

    resolved = _resolve_mode(query, mode)
    graph_env = get_graph_rag_mode()
    fallback_reason: Optional[str] = None
    paths: List[EvidencePath] = []

    vector_task = _vector_items(
        query,
        limit=limit,
        project_id=project_id,
        search_sources=search_sources,
        search_notes=search_notes,
        minimum_score=minimum_score,
    )

    if resolved == "vector":
        items = await vector_task
        items, drawing_note = await _merge_drawing_evidence(
            query=query,
            project_id=project_id,
            existing_items=items[:limit],
            limit=limit,
        )
        return EvidenceBundle(
            items=items[:limit],
            paths=[],
            retrieval_mode_used="vector",
            fallback_reason=drawing_note,
            embedding_dim_warning=dim_warning,
        )

    # hybrid and graph both start with lexical + vector
    text_task = _text_items(
        query,
        limit=limit,
        project_id=project_id,
        search_sources=search_sources,
        search_notes=search_notes,
    )
    vector_items, text_items = await asyncio.gather(vector_task, text_task)
    fused = reciprocal_rank_fusion([vector_items, text_items])[:limit]

    if resolved == "hybrid":
        fused, drawing_note = await _merge_drawing_evidence(
            query=query,
            project_id=project_id,
            existing_items=fused,
            limit=limit,
        )
        return EvidenceBundle(
            items=fused,
            paths=[],
            retrieval_mode_used="hybrid",
            fallback_reason=drawing_note,
            embedding_dim_warning=dim_warning,
        )

    # graph mode (or shadow comparison)
    graph_items, paths = await _graph_expand(
        query, project_id=project_id, seed_items=fused, limit=limit
    )

    if graph_env == "shadow":
        logger.info(
            "Graph RAG shadow: vector/hybrid={hybrid_n} graph={graph_n} paths={path_n}",
            hybrid_n=len(fused),
            graph_n=len(graph_items),
            path_n=len(paths),
        )
        fused, drawing_note = await _merge_drawing_evidence(
            query=query,
            project_id=project_id,
            existing_items=fused,
            limit=limit,
        )
        return EvidenceBundle(
            items=fused,
            paths=paths,
            retrieval_mode_used="hybrid",
            fallback_reason=drawing_note or "shadow_mode",
            embedding_dim_warning=dim_warning,
        )

    if not graph_items:
        fallback_reason = "graph_empty_or_unavailable"
        fused, drawing_note = await _merge_drawing_evidence(
            query=query,
            project_id=project_id,
            existing_items=fused,
            limit=limit,
        )
        return EvidenceBundle(
            items=fused,
            paths=[],
            retrieval_mode_used="hybrid",
            fallback_reason=drawing_note or fallback_reason,
            embedding_dim_warning=dim_warning,
        )

    final = reciprocal_rank_fusion([fused, graph_items])[:limit]
    final, drawing_note = await _merge_drawing_evidence(
        query=query,
        project_id=project_id,
        existing_items=final,
        limit=limit,
    )
    return EvidenceBundle(
        items=final,
        paths=paths,
        retrieval_mode_used="graph",
        fallback_reason=drawing_note or fallback_reason,
        embedding_dim_warning=dim_warning,
    )

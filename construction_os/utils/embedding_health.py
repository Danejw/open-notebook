"""Embedding dimension drift diagnostics (RAG-003)."""

from __future__ import annotations

import time
from typing import Any, Optional

from loguru import logger
from pydantic import BaseModel, Field, computed_field

from construction_os.database.repository import repo_query

# Avoid probing embeddings + scanning tables on every search/chat turn.
_DIM_WARNING_CACHE_TTL_SECONDS = 60.0
_dim_warning_cache_monotonic: float = 0.0
_dim_warning_cache_value: Optional[str] = None


class EmbeddingDimensionHealth(BaseModel):
    """Counts of indexed vectors matching / not matching the active embedder dim."""

    expected_dimension: Optional[int] = None
    source_embedding_matched: int = 0
    source_embedding_mismatched: int = 0
    note_matched: int = 0
    note_mismatched: int = 0
    dimensions_by_table: dict[str, dict[int, int]] = Field(default_factory=dict)
    message: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def mismatched_total(self) -> int:
        return self.source_embedding_mismatched + self.note_mismatched

    @computed_field  # type: ignore[prop-decorator]
    @property
    def indexed_total(self) -> int:
        return (
            self.source_embedding_matched
            + self.source_embedding_mismatched
            + self.note_matched
            + self.note_mismatched
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def needs_rebuild(self) -> bool:
        return self.expected_dimension is not None and self.mismatched_total > 0


def summarize_dimension_counts(
    rows: list[dict[str, Any]],
    *,
    expected_dim: int,
) -> tuple[int, int, dict[int, int]]:
    """Split GROUP BY dim rows into matched / mismatched counts."""
    by_dim: dict[int, int] = {}
    matched = 0
    mismatched = 0
    for row in rows:
        try:
            dim = int(row.get("dim"))
            count = int(row.get("count") or 0)
        except (TypeError, ValueError):
            continue
        if count <= 0:
            continue
        by_dim[dim] = by_dim.get(dim, 0) + count
        if dim == expected_dim:
            matched += count
        else:
            mismatched += count
    return matched, mismatched, by_dim


async def probe_expected_embedding_dimension() -> Optional[int]:
    """Return the active embedding model dimension, or None if unavailable."""
    try:
        from construction_os.ai.models import model_manager
        from construction_os.utils.embedding import generate_embedding

        if not await model_manager.get_embedding_model():
            return None
        vector = await generate_embedding("dimension probe")
        if not vector:
            return None
        return len(vector)
    except Exception as error:
        logger.warning("Unable to probe embedding dimension: {}", error)
        return None


async def _dimension_histogram(table: str) -> list[dict[str, Any]]:
    """Return [{dim, count}, ...] for non-empty embeddings in ``table``."""
    # SurrealQL: group by vector length so operators can see drift buckets.
    return await repo_query(
        f"""
        SELECT array::len(embedding) AS dim, count() AS count
        FROM {table}
        WHERE embedding != none AND array::len(embedding) > 0
        GROUP BY dim
        """
    )


async def get_embedding_dimension_health() -> EmbeddingDimensionHealth:
    """Compare indexed embedding lengths to the currently configured model."""
    expected = await probe_expected_embedding_dimension()
    if expected is None:
        return EmbeddingDimensionHealth(
            expected_dimension=None,
            message=(
                "No embedding model configured; dimension drift cannot be assessed."
            ),
        )

    source_rows = await _dimension_histogram("source_embedding")
    note_rows = await _dimension_histogram("note")

    src_matched, src_mismatched, src_by_dim = summarize_dimension_counts(
        source_rows or [], expected_dim=expected
    )
    note_matched, note_mismatched, note_by_dim = summarize_dimension_counts(
        note_rows or [], expected_dim=expected
    )

    health = EmbeddingDimensionHealth(
        expected_dimension=expected,
        source_embedding_matched=src_matched,
        source_embedding_mismatched=src_mismatched,
        note_matched=note_matched,
        note_mismatched=note_mismatched,
        dimensions_by_table={
            "source_embedding": src_by_dim,
            "note": note_by_dim,
        },
    )
    if health.needs_rebuild:
        health.message = (
            f"{health.mismatched_total} of {health.indexed_total} indexed embeddings "
            f"do not match the current model dimension ({expected}). "
            "Rebuild embeddings to restore vector search recall."
        )
    else:
        health.message = (
            f"All {health.indexed_total} indexed embeddings match dimension {expected}."
        )
    return health


def clear_embedding_dimension_warning_cache() -> None:
    """Reset the query-path dim-warning cache (tests / after rebuild)."""
    global _dim_warning_cache_monotonic, _dim_warning_cache_value
    _dim_warning_cache_monotonic = 0.0
    _dim_warning_cache_value = None


async def get_cached_embedding_dimension_warning() -> Optional[str]:
    """Return a rebuild warning for query paths when indexed dims drift (A+ pack).

    Cached briefly so chat/search do not re-probe the embedder on every request.
    Returns None when healthy or when health cannot be assessed.
    """
    global _dim_warning_cache_monotonic, _dim_warning_cache_value
    now = time.monotonic()
    if now - _dim_warning_cache_monotonic < _DIM_WARNING_CACHE_TTL_SECONDS:
        return _dim_warning_cache_value
    try:
        health = await get_embedding_dimension_health()
        warning = health.message if health.needs_rebuild else None
    except Exception as error:
        logger.debug("Embedding dimension health check skipped: {}", error)
        warning = None
    _dim_warning_cache_value = warning
    _dim_warning_cache_monotonic = now
    if warning:
        logger.warning("Embedding dimension drift on query path: {}", warning)
    return warning

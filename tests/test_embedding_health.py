"""Tests for embedding dimension health + query-path warning cache."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from construction_os.utils.embedding_health import (
    EmbeddingDimensionHealth,
    clear_embedding_dimension_warning_cache,
    get_cached_embedding_dimension_warning,
    summarize_dimension_counts,
)


def test_summarize_dimension_counts_splits_matched_mismatched() -> None:
    matched, mismatched, by_dim = summarize_dimension_counts(
        [{"dim": 768, "count": 10}, {"dim": 1024, "count": 3}],
        expected_dim=768,
    )
    assert matched == 10
    assert mismatched == 3
    assert by_dim == {768: 10, 1024: 3}


def test_needs_rebuild_true_when_mismatched() -> None:
    health = EmbeddingDimensionHealth(
        expected_dimension=768,
        source_embedding_matched=5,
        source_embedding_mismatched=2,
    )
    assert health.needs_rebuild is True
    assert health.mismatched_total == 2


def test_cached_warning_returns_message_when_rebuild_needed() -> None:
    clear_embedding_dimension_warning_cache()
    health = EmbeddingDimensionHealth(
        expected_dimension=768,
        source_embedding_matched=1,
        source_embedding_mismatched=4,
        message="4 of 5 indexed embeddings do not match. Rebuild embeddings.",
    )
    assert health.needs_rebuild is True

    with patch(
        "construction_os.utils.embedding_health.get_embedding_dimension_health",
        new=AsyncMock(return_value=health),
    ) as mock_health:
        warning = asyncio.run(get_cached_embedding_dimension_warning())
        cached = asyncio.run(get_cached_embedding_dimension_warning())

    assert warning == health.message
    assert cached == health.message
    mock_health.assert_awaited_once()
    clear_embedding_dimension_warning_cache()


def test_cached_warning_none_when_healthy() -> None:
    clear_embedding_dimension_warning_cache()
    health = EmbeddingDimensionHealth(
        expected_dimension=768,
        source_embedding_matched=10,
        source_embedding_mismatched=0,
        message="All 10 indexed embeddings match dimension 768.",
    )
    with patch(
        "construction_os.utils.embedding_health.get_embedding_dimension_health",
        new=AsyncMock(return_value=health),
    ):
        warning = asyncio.run(get_cached_embedding_dimension_warning())
    assert warning is None
    clear_embedding_dimension_warning_cache()

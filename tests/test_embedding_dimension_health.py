"""Tests for embedding dimension drift diagnostics (RAG-003)."""

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from construction_os.utils.embedding_health import (
    EmbeddingDimensionHealth,
    summarize_dimension_counts,
)


def test_summarize_dimension_counts_splits_match_and_mismatch() -> None:
    rows = [
        {"dim": 768, "count": 10},
        {"dim": 1536, "count": 4},
        {"dim": 384, "count": 1},
    ]
    matched, mismatched, by_dim = summarize_dimension_counts(rows, expected_dim=768)
    assert matched == 10
    assert mismatched == 5
    assert by_dim == {768: 10, 1536: 4, 384: 1}


def test_summarize_dimension_counts_handles_empty() -> None:
    matched, mismatched, by_dim = summarize_dimension_counts([], expected_dim=768)
    assert matched == 0
    assert mismatched == 0
    assert by_dim == {}


@pytest.mark.asyncio
async def test_get_embedding_dimension_health_aggregates_tables() -> None:
    from construction_os.utils.embedding_health import get_embedding_dimension_health

    async def fake_query(sql: str, vars: dict[str, Any] | None = None) -> list[dict]:
        if "FROM source_embedding" in sql:
            return [{"dim": 768, "count": 8}, {"dim": 1536, "count": 2}]
        if "FROM note" in sql:
            return [{"dim": 768, "count": 3}, {"dim": 1024, "count": 1}]
        raise AssertionError(f"unexpected query: {sql}")

    with (
        patch(
            "construction_os.utils.embedding_health.probe_expected_embedding_dimension",
            new=AsyncMock(return_value=768),
        ),
        patch(
            "construction_os.utils.embedding_health.repo_query",
            new=AsyncMock(side_effect=fake_query),
        ),
    ):
        health = await get_embedding_dimension_health()

    assert isinstance(health, EmbeddingDimensionHealth)
    assert health.expected_dimension == 768
    assert health.source_embedding_matched == 8
    assert health.source_embedding_mismatched == 2
    assert health.note_matched == 3
    assert health.note_mismatched == 1
    assert health.mismatched_total == 3
    assert health.indexed_total == 14
    assert health.needs_rebuild is True


@pytest.mark.asyncio
async def test_get_embedding_dimension_health_no_model() -> None:
    from construction_os.utils.embedding_health import get_embedding_dimension_health

    with patch(
        "construction_os.utils.embedding_health.probe_expected_embedding_dimension",
        new=AsyncMock(return_value=None),
    ):
        health = await get_embedding_dimension_health()

    assert health.expected_dimension is None
    assert health.needs_rebuild is False
    assert health.mismatched_total == 0

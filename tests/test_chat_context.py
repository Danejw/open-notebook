"""Tests for query-scoped chat context helpers."""

from construction_os.graphs.chat_context import (
    CHAT_CONTEXT_MAX_TOKENS,
    eligible_note_ids,
    eligible_source_ids,
    estimate_preview_tokens,
)


def test_eligible_source_ids_from_config():
    config = {
        "sources": {
            "source:a": "insights",
            "b": "full content",
            "source:c": "not in",
        }
    }
    assert eligible_source_ids(config) == {"source:a", "source:b"}


def test_eligible_note_ids_from_legacy_notes_config():
    config = {
        "notes": {
            "note:a": "full content",
            "b": "not in",
        }
    }
    assert eligible_note_ids(config) == {"note:a"}


def test_eligible_note_ids_from_artifacts_config():
    config = {
        "artifacts": {
            "note:b": "full content",
            "c": "not in",
        }
    }
    assert eligible_note_ids(config) == {"note:b"}


def test_eligible_note_ids_merges_artifacts_and_notes():
    config = {
        "notes": {"note:legacy": "full content"},
        "artifacts": {"note:canonical": "full content"},
    }
    assert eligible_note_ids(config) == {"note:legacy", "note:canonical"}


def test_estimate_preview_tokens_empty_pool():
    assert estimate_preview_tokens(source_pool_size=0, note_pool_size=0) == 0


def test_estimate_preview_tokens_capped():
    tokens = estimate_preview_tokens(source_pool_size=100, note_pool_size=50)
    assert 0 < tokens <= CHAT_CONTEXT_MAX_TOKENS

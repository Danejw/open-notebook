"""Tests for shared context inclusion mode normalization."""

from construction_os.utils.context_mode import (
    is_excluded,
    is_note_included,
    is_source_included,
    normalize_inclusion_status,
)


def test_normalize_inclusion_status_maps_insights_to_full():
    assert normalize_inclusion_status("insights") == "full content"
    assert normalize_inclusion_status("full content") == "full content"
    assert normalize_inclusion_status("not in") == "not in"


def test_is_source_included():
    assert is_source_included("full content") is True
    assert is_source_included("insights") is True
    assert is_source_included("not in") is False


def test_is_note_included():
    assert is_note_included("full content") is True
    assert is_note_included("insights") is False
    assert is_note_included("not in") is False


def test_is_excluded():
    assert is_excluded("not in") is True
    assert is_excluded("full content") is False

"""Unit tests for HTML span extract/replace helpers."""

import pytest

from construction_os.utils.html_spans import (
    StructureChangedError,
    apply_span_updates,
    assert_same_span_structure,
    extract_spans,
)

SAMPLE = """<html><body>
<p>Trade: <span id="trade">Carpentry</span></p>
<p>Total: <span class="amt">$12,000</span></p>
</body></html>"""


def test_extract_spans_returns_ordered_text_fields():
    spans = extract_spans(SAMPLE)
    assert [(s.index, s.text) for s in spans] == [
        (0, "Carpentry"),
        (1, "$12,000"),
    ]


def test_apply_span_updates_replaces_text_only():
    updated = apply_span_updates(SAMPLE, {0: "Mechanical", 1: "$9,500"})
    spans = extract_spans(updated)
    assert [s.text for s in spans] == ["Mechanical", "$9,500"]
    assert "<p>Trade:" in updated
    assert 'id="trade"' in updated


def test_apply_span_updates_partial_keeps_other_spans():
    updated = apply_span_updates(SAMPLE, {1: "$1"})
    spans = extract_spans(updated)
    assert [s.text for s in spans] == ["Carpentry", "$1"]


def test_assert_same_span_structure_rejects_removed_span():
    bad = SAMPLE.replace('<span id="trade">Carpentry</span>', "<div>Carpentry</div>")
    with pytest.raises(StructureChangedError):
        assert_same_span_structure(SAMPLE, bad)


def test_assert_same_span_structure_allows_text_only_change():
    good = apply_span_updates(SAMPLE, {0: "Electrical"})
    assert_same_span_structure(SAMPLE, good)

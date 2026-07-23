"""Tests for RAG citation verification (RAG-002)."""

from construction_os.utils.citation_verify import (
    collect_evidence_ids_from_texts,
    strip_unverified_citations,
)


def test_strip_removes_ids_not_in_allowed_set() -> None:
    text = (
        "Deep learning is useful [source:real]. "
        "Also see [source:fake] and [note:ok]."
    )
    result = strip_unverified_citations(
        text, allowed_ids=["source:real", "note:ok"]
    )
    assert "source:fake" not in result.text
    assert "source:real" in result.text
    assert "note:ok" in result.text
    assert result.removed_ids == ["source:fake"]
    assert result.kept_ids == ["source:real", "note:ok"]


def test_strip_removes_all_citations_when_allowed_empty() -> None:
    text = "Claim [source:abc] and [note:xyz]."
    result = strip_unverified_citations(text, allowed_ids=[])
    assert "source:abc" not in result.text
    assert "note:xyz" not in result.text
    assert set(result.removed_ids) == {"source:abc", "note:xyz"}
    assert result.kept_ids == []


def test_strip_is_noop_when_all_citations_allowed() -> None:
    text = "Grounded answer [source:a] [note:b]."
    result = strip_unverified_citations(text, allowed_ids=["source:a", "note:b"])
    assert result.text == text
    assert result.removed_ids == []
    assert result.kept_ids == ["source:a", "note:b"]


def test_collect_evidence_ids_from_texts_dedupes_and_orders() -> None:
    ids = collect_evidence_ids_from_texts(
        [
            "- id: source:one\n  parent: source:one",
            "results include source:two and source:one again",
            "note:alpha",
        ]
    )
    assert ids == ["source:one", "source:two", "note:alpha"]

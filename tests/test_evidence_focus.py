"""Unit tests for RAG-012 evidence focus mapping."""

from __future__ import annotations

from construction_os.graphs.chat_context import evidence_focus_from_items
from construction_os.retrieval.types import EvidenceItem


def test_evidence_focus_first_source_wins() -> None:
    items = [
        EvidenceItem(
            id="source:a",
            parent_id="source:a",
            title="A",
            score=0.9,
            content="first hit",
            chunk_id="source_embedding:1",
            char_start=10,
            char_end=20,
            page=2,
        ),
        EvidenceItem(
            id="source:a",
            parent_id="source:a",
            title="A",
            score=0.5,
            content="second hit",
            chunk_id="source_embedding:2",
            char_start=30,
            char_end=40,
            page=3,
        ),
        EvidenceItem(
            id="note:n1",
            parent_id="note:n1",
            title="Note",
            score=0.8,
            content="artifact",
        ),
    ]
    focus = evidence_focus_from_items(items)
    assert len(focus) == 1
    assert focus[0]["sourceId"] == "source:a"
    assert focus[0]["chunkId"] == "source_embedding:1"
    assert focus[0]["page"] == 2
    assert focus[0]["charStart"] == 10
    assert focus[0]["charEnd"] == 20
    assert "first hit" in focus[0]["excerpt"]

"""Unit tests for KG canonical ownership, merge policy, and integrity helpers."""

from __future__ import annotations

from construction_os.domain.knowledge_graph import (
    PROJECT_WIDE_MERGE_TYPES,
    merges_project_wide,
    normalize_entity_key,
    supporting_source_ids_from_entity,
)
from construction_os.knowledge.integrity import (
    dangling_relation_queries,
    entity_still_has_support,
)


def test_project_wide_merge_types():
    assert merges_project_wide("Reference") is True
    assert merges_project_wide("Specification") is True
    assert merges_project_wide("Date") is True
    assert merges_project_wide("Person") is False
    assert merges_project_wide("Topic") is False
    assert merges_project_wide("Organization") is False
    assert "Reference" in PROJECT_WIDE_MERGE_TYPES


def test_supporting_source_ids_includes_primary_merged_and_supporting():
    entity = {
        "source_id": "source:a",
        "metadata": {
            "MERGED_FROM": ["source:b"],
            "supporting_sources": ["source:a", "source:c"],
        },
    }
    ids = supporting_source_ids_from_entity(entity)
    assert set(ids) == {"source:a", "source:b", "source:c"}
    assert ids[0] == "source:a"


def test_normalize_still_works_for_sheet_refs():
    assert normalize_entity_key("A-501") == "a 501"


def test_dangling_relation_queries_are_read_only():
    from_q, to_q = dangling_relation_queries()
    assert "NOT IN" in from_q
    assert "NOT IN" in to_q
    assert "DELETE" not in from_q.upper()
    assert "DELETE" not in to_q.upper()


def test_offsets_in_chunk_finds_span():
    from construction_os.knowledge.writer import _offsets_in_chunk, find_text_offsets

    chunks = [{"id": "source_embedding:1", "content": "See detail 3/A-501 on plan."}]
    start, end = _offsets_in_chunk(chunks, 0, "3/A-501")
    assert start == 11
    assert end == 18
    assert find_text_offsets("See detail 3/A-501 on plan.", "3/A-501") == (11, 18)


def test_materialize_supporting_sources_metadata():
    from construction_os.knowledge.backfill import (
        materialize_supporting_sources_metadata,
        needs_derived_flag,
    )

    entity = {
        "source_id": "source:a",
        "metadata": {"MERGED_FROM": ["source:b"]},
    }
    meta = materialize_supporting_sources_metadata(entity)
    assert meta is not None
    assert meta["supporting_sources"] == ["source:a", "source:b"]

    already = {
        "source_id": "source:a",
        "metadata": {"supporting_sources": ["source:a", "source:b"], "MERGED_FROM": ["source:b"]},
    }
    assert materialize_supporting_sources_metadata(already) is None

    assert needs_derived_flag({"extractor": "project_linker", "metadata": {}}) is True
    assert (
        needs_derived_flag(
            {"extractor": "project_linker", "metadata": {"derived": True}}
        )
        is False
    )
    assert needs_derived_flag({"extractor": "generic", "metadata": {}}) is False


def test_graph_rag_mode_defaults_to_on(monkeypatch):
    monkeypatch.delenv("CONSTRUCTION_OS_GRAPH_RAG_MODE", raising=False)
    from construction_os.retrieval.evidence_retriever import get_graph_rag_mode

    assert get_graph_rag_mode() == "on"
    monkeypatch.setenv("CONSTRUCTION_OS_GRAPH_RAG_MODE", "off")
    assert get_graph_rag_mode() == "off"

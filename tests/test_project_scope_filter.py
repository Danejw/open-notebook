"""Unit tests for project-scoped search filtering."""

from construction_os.domain.project import filter_search_results_by_project


def test_filter_keeps_project_sources_and_notes():
    results = [
        {"id": "source:a", "parent_id": "source:a", "title": "A"},
        {"id": "source_embedding:1", "parent_id": "source:a", "title": "Chunk"},
        {"id": "source:b", "parent_id": "source:b", "title": "B"},
        {"id": "note:n1", "parent_id": "note:n1", "title": "Note"},
        {"id": "note:n2", "parent_id": "note:n2", "title": "Other"},
    ]
    filtered = filter_search_results_by_project(
        results, source_ids={"source:a"}, note_ids={"note:n1"}
    )
    ids = {r["id"] for r in filtered}
    assert ids == {"source:a", "source_embedding:1", "note:n1"}

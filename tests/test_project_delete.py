"""Tests for Project.delete cascade cleanup."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from construction_os.domain.project import Project
from construction_os.exceptions import InvalidInputError


def _project(project_id: str = "project:abc") -> Project:
    project = Project(name="Demo", description="test")
    project.id = project_id
    return project


@pytest.mark.asyncio
async def test_get_delete_preview_uses_safe_source_query():
    project = _project()
    queries: list[str] = []

    async def fake_repo_query(query: str, _vars: dict[str, Any] | None = None):
        queries.append(query)
        if "project_note" in query:
            return [{"count": 2}]
        if "assigned_others" in query:
            return [
                {"id": "source:1", "assigned_others": 0},
                {"id": "source:2", "assigned_others": 1},
            ]
        return []

    with patch("construction_os.domain.project.repo_query", side_effect=fake_repo_query):
        preview = await project.get_delete_preview()

    assert preview == {
        "note_count": 2,
        "exclusive_source_count": 1,
        "shared_source_count": 1,
    }
    assert any("SELECT VALUE in FROM reference WHERE out = $project_id" in q for q in queries)
    assert not any("[0]" in q for q in queries if "assigned_others" in q)


@pytest.mark.asyncio
async def test_get_delete_preview_handles_zero_sources():
    project = _project()

    async def fake_repo_query(query: str, _vars: dict[str, Any] | None = None):
        if "project_note" in query:
            return [{"count": 0}]
        if "assigned_others" in query:
            return []
        return []

    with patch("construction_os.domain.project.repo_query", side_effect=fake_repo_query):
        preview = await project.get_delete_preview()

    assert preview == {
        "note_count": 0,
        "exclusive_source_count": 0,
        "shared_source_count": 0,
    }


@pytest.mark.asyncio
async def test_project_delete_cascades_associated_data():
    project = _project("project:to-delete")
    note = MagicMock()
    note.delete = AsyncMock()
    session = MagicMock()
    session.id = "chat_session:s1"
    session.delete = AsyncMock()

    executed: list[tuple[str, dict[str, Any] | None]] = []

    async def fake_repo_query(query: str, vars: dict[str, Any] | None = None):
        executed.append((query, vars))
        if "count() as count FROM reference" in query:
            return [{"count": 1}]
        return []

    with (
        patch.object(Project, "get_notes", AsyncMock(return_value=[note])),
        patch.object(Project, "get_chat_sessions", AsyncMock(return_value=[session])),
        patch(
            "construction_os.domain.project.ChatQueueRepository.delete_for_session",
            new_callable=AsyncMock,
        ) as delete_queue,
        patch("construction_os.domain.project.repo_query", side_effect=fake_repo_query),
        patch(
            "construction_os.domain.base.ObjectModel.delete",
            new_callable=AsyncMock,
            return_value=True,
        ) as super_delete,
    ):
        result = await project.delete(delete_exclusive_sources=False)

    assert result == {
        "deleted_notes": 1,
        "deleted_sources": 0,
        "unlinked_sources": 1,
    }
    note.delete.assert_awaited_once()
    delete_queue.assert_awaited_once_with("chat_session:s1")
    session.delete.assert_awaited_once()
    super_delete.assert_awaited_once()

    joined = "\n".join(q for q, _ in executed)
    assert "DELETE project_note WHERE out = $project_id" in joined
    assert "DELETE refers_to WHERE out = $project_id" in joined
    assert "DELETE document WHERE project_id = $project_id_str" in joined
    assert "DELETE kg_mention WHERE project_id = $project_id" in joined
    assert "DELETE kg_entity WHERE project_id = $project_id" in joined
    assert "DELETE drawing_embedding WHERE project_id = $project_id" in joined
    assert "UPDATE opportunity SET project_id = NONE" in joined
    assert "DELETE reference WHERE out = $project_id" in joined

    # document/opportunity use string id; graph/drawing use record id
    doc_call = next(v for q, v in executed if v and "project_id_str" in v)
    assert doc_call["project_id_str"] == "project:to-delete"
    kg_call = next(
        v
        for q, v in executed
        if v and "project_id" in v and "kg_mention" in q
    )
    assert kg_call["project_id"] is not None


@pytest.mark.asyncio
async def test_project_delete_without_id_raises():
    project = Project(name="Demo", description="test")
    project.id = None
    with pytest.raises(InvalidInputError):
        await project.delete()

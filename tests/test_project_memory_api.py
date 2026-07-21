"""API coverage for project memory CRUD endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from api.routers.projects import (
    delete_project_memory_endpoint,
    get_project_memory_endpoint,
    update_project_memory_endpoint,
)
from api.models import ProjectMemoryUpdate
from construction_os.exceptions import NotFoundError
from construction_os.services.project_memory import ProjectMemorySnapshot


def _snapshot() -> ProjectMemorySnapshot:
    return ProjectMemorySnapshot(
        project_id="project:abc",
        content="## Status\nEstimating.",
        evidence_ids=["source:spec1"],
        revision=2,
        last_reason="project_chat_completed",
        created_at="2026-07-21T10:00:00+00:00",
        updated_at="2026-07-21T11:00:00+00:00",
    )


@pytest.mark.asyncio
async def test_get_project_memory_returns_null_when_missing():
    with (
        patch("api.routers.projects.Project.get", new_callable=AsyncMock) as get_project,
        patch(
            "api.routers.projects.get_project_memory",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        get_project.return_value = object()
        result = await get_project_memory_endpoint("project:abc")
    assert result is None


@pytest.mark.asyncio
async def test_get_project_memory_returns_snapshot():
    with (
        patch("api.routers.projects.Project.get", new_callable=AsyncMock) as get_project,
        patch(
            "api.routers.projects.get_project_memory",
            new_callable=AsyncMock,
            return_value=_snapshot(),
        ),
    ):
        get_project.return_value = object()
        result = await get_project_memory_endpoint("project:abc")
    assert result is not None
    assert result.content == "## Status\nEstimating."
    assert result.evidence_ids == ["source:spec1"]
    assert result.revision == 2


@pytest.mark.asyncio
async def test_update_project_memory_preserves_evidence_and_bumps_revision():
    existing = _snapshot()
    saved = ProjectMemorySnapshot(
        project_id="project:abc",
        content="Edited by user",
        evidence_ids=["source:spec1"],
        revision=3,
        last_reason="user_edit",
        created_at=existing.created_at,
        updated_at="2026-07-21T12:00:00+00:00",
    )
    with (
        patch("api.routers.projects.Project.get", new_callable=AsyncMock) as get_project,
        patch(
            "api.routers.projects.get_project_memory",
            new_callable=AsyncMock,
            return_value=existing,
        ),
        patch(
            "api.routers.projects.save_project_memory",
            new_callable=AsyncMock,
            return_value=saved,
        ) as save_memory,
    ):
        get_project.return_value = object()
        result = await update_project_memory_endpoint(
            "project:abc", ProjectMemoryUpdate(content="Edited by user")
        )

    save_memory.assert_awaited_once_with(
        project_id="project:abc",
        content="Edited by user",
        evidence_ids=["source:spec1"],
        revision=3,
        reason="user_edit",
        created_at=existing.created_at,
    )
    assert result.content == "Edited by user"
    assert result.revision == 3


@pytest.mark.asyncio
async def test_delete_project_memory_clears_record():
    with (
        patch("api.routers.projects.Project.get", new_callable=AsyncMock) as get_project,
        patch(
            "api.routers.projects.delete_project_memory",
            new_callable=AsyncMock,
        ) as delete_memory,
    ):
        get_project.return_value = object()
        result = await delete_project_memory_endpoint("project:abc")

    delete_memory.assert_awaited_once_with("project:abc")
    assert result["message"] == "Project memory cleared"


@pytest.mark.asyncio
async def test_get_project_memory_404_when_project_missing():
    with patch(
        "api.routers.projects.Project.get",
        new_callable=AsyncMock,
        side_effect=NotFoundError("missing"),
    ):
        with pytest.raises(HTTPException) as exc:
            await get_project_memory_endpoint("project:missing")
    assert exc.value.status_code == 404

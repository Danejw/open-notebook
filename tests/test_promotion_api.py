"""Tests for promotion endpoints (ingest text, project artifact → source)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from construction_os.domain.project import ProjectArtifact, Source


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


class TestIngestTextSource:
    @pytest.mark.asyncio
    @patch("api.promotion_service.promote_text_to_source", new_callable=AsyncMock)
    async def test_ingest_text_endpoint(
        self, mock_promote, client
    ):
        mock_promote.return_value = MagicMock(
            id="source:promoted",
            title="Bid Scope",
            topics=[],
            asset=None,
            full_text=None,
            embedded=False,
            embedded_chunks=0,
            created="2026-01-01",
            updated="2026-01-01",
            command_id="command:123",
            status="new",
            processing_info={"async": True},
            projects=["project:1"],
            pipeline_stage=None,
            stage=None,
            processing_failures={},
            failure_details_unavailable=False,
        )

        response = client.post(
            "/api/sources/ingest-text",
            json={
                "content": "# Bid scope summary\n\nScope details here.",
                "title": "Bid Scope",
                "project_ids": ["project:1"],
                "embed": True,
                "artifacts": [],
            },
        )

        assert response.status_code == 200
        mock_promote.assert_awaited_once()

    def test_ingest_text_empty_content(self, client):
        response = client.post(
            "/api/sources/ingest-text",
            json={
                "content": "   ",
                "title": "Empty",
                "project_ids": ["project:1"],
            },
        )
        assert response.status_code == 422 or response.status_code == 400


class TestPromoteArtifactToSource:
    @pytest.mark.asyncio
    @patch("api.promotion_service.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.promotion_service._validate_projects", new_callable=AsyncMock)
    @patch("api.promotion_service.get_note_project_ids", new_callable=AsyncMock)
    async def test_generated_artifact_promotion(
        self,
        mock_get_projects,
        mock_validate_projects,
        mock_submit,
        client,
    ):
        mock_get_projects.return_value = ["project:1"]
        mock_submit.return_value = "command:456"

        artifact = ProjectArtifact(
            title="Takeoff",
            content="Quantity list",
            note_type="generated",
        )
        artifact.id = "note:abc"
        artifact.created = "2026-01-01"
        artifact.updated = "2026-01-01"

        saved_sources = []

        async def capture_save(self_source):
            saved_sources.append(self_source)
            if not self_source.id:
                self_source.id = "source:from-artifact"

        with patch.object(ProjectArtifact, "get", new_callable=AsyncMock, return_value=artifact):
            with patch.object(Source, "save", autospec=True, side_effect=capture_save):
                with patch.object(Source, "add_to_project", new_callable=AsyncMock):
                    response = client.post(
                        "/api/project-artifacts/note:abc/ingest-as-source",
                        json={"embed": True, "artifacts": []},
                    )

        assert response.status_code == 200
        assert len(saved_sources) >= 1
        mock_submit.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("api.promotion_service.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.promotion_service._validate_projects", new_callable=AsyncMock)
    @patch("api.promotion_service.get_note_project_ids", new_callable=AsyncMock)
    async def test_ai_artifact_promotion(
        self,
        mock_get_projects,
        mock_validate_projects,
        mock_submit,
        client,
    ):
        mock_get_projects.return_value = ["project:1"]
        mock_submit.return_value = "command:789"

        artifact = ProjectArtifact(
            title="Chat capture",
            content="Saved from chat",
            note_type="ai",
        )
        artifact.id = "note:ai"
        artifact.created = "2026-01-01"
        artifact.updated = "2026-01-01"

        with patch.object(ProjectArtifact, "get", new_callable=AsyncMock, return_value=artifact):
            with patch.object(Source, "save", new_callable=AsyncMock):
                with patch.object(Source, "add_to_project", new_callable=AsyncMock):
                    response = client.post(
                        "/api/project-artifacts/note:ai/ingest-as-source",
                        json={"embed": True},
                    )

        assert response.status_code == 200
        mock_submit.assert_awaited_once()

    @pytest.mark.asyncio
    @patch.object(ProjectArtifact, "get", new_callable=AsyncMock)
    async def test_artifact_promotion_rejects_manual_kind(self, mock_get, client):
        artifact = ProjectArtifact(title="Manual artifact", content="Notes", note_type="manual")
        artifact.id = "note:manual"
        mock_get.return_value = artifact

        response = client.post(
            "/api/project-artifacts/note:manual/ingest-as-source",
            json={"project_id": "project:1"},
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    @patch("api.promotion_service.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.promotion_service._validate_projects", new_callable=AsyncMock)
    @patch("api.promotion_service.get_note_project_ids", new_callable=AsyncMock)
    async def test_notes_alias_promotion_smoke(
        self,
        mock_get_projects,
        mock_validate_projects,
        mock_submit,
        client,
    ):
        """Deprecated /notes ingest-as-source alias still works for generated artifacts."""
        mock_get_projects.return_value = ["project:1"]
        mock_submit.return_value = "command:alias"

        artifact = ProjectArtifact(
            title="Generated",
            content="Body",
            note_type="generated",
        )
        artifact.id = "note:alias"
        artifact.created = "2026-01-01"
        artifact.updated = "2026-01-01"

        with patch.object(ProjectArtifact, "get", new_callable=AsyncMock, return_value=artifact):
            with patch.object(Source, "save", new_callable=AsyncMock):
                with patch.object(Source, "add_to_project", new_callable=AsyncMock):
                    response = client.post(
                        "/api/notes/note:alias/ingest-as-source",
                        json={"embed": True},
                    )

        assert response.status_code == 200

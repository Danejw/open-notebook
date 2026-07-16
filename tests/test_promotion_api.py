"""Tests for promotion endpoints (ingest text, note → source)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from construction_os.domain.project import Note, Source


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


class TestPromoteNoteToSource:
    @pytest.mark.asyncio
    @patch("api.promotion_service.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.promotion_service._validate_projects", new_callable=AsyncMock)
    @patch("api.promotion_service.get_note_project_ids", new_callable=AsyncMock)
    async def test_note_promotion(
        self,
        mock_get_projects,
        mock_validate_projects,
        mock_submit,
        client,
    ):
        mock_get_projects.return_value = ["project:1"]
        mock_submit.return_value = "command:456"

        note = Note(
            title="Takeoff",
            content="Quantity list",
            note_type="artifact",
        )
        note.id = "note:abc"
        note.created = "2026-01-01"
        note.updated = "2026-01-01"

        saved_sources = []

        async def capture_save(self_source):
            saved_sources.append(self_source)
            if not self_source.id:
                self_source.id = "source:from-note"

        with patch.object(Note, "get", new_callable=AsyncMock, return_value=note):
            with patch.object(Source, "save", autospec=True, side_effect=capture_save):
                with patch.object(Source, "add_to_project", new_callable=AsyncMock):
                    response = client.post(
                        "/api/notes/note:abc/ingest-as-source",
                        json={"embed": True, "artifacts": []},
                    )

        assert response.status_code == 200
        assert len(saved_sources) >= 1
        mock_submit.assert_awaited_once()

    @pytest.mark.asyncio
    @patch.object(Note, "get", new_callable=AsyncMock)
    async def test_note_promotion_rejects_human_type(self, mock_get, client):
        note = Note(title="Human note", content="Notes", note_type="human")
        note.id = "note:human"
        mock_get.return_value = note

        response = client.post(
            "/api/notes/note:human/ingest-as-source",
            json={"project_id": "project:1"},
        )

        assert response.status_code == 400

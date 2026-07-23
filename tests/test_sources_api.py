"""Tests for the sources API endpoint."""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from construction_os.config import UPLOADS_FOLDER
from construction_os.domain.project import Source


@pytest.fixture
def client():
    """Create test client after environment variables have been cleared by conftest."""
    from api.main import app

    return TestClient(app)


class TestAsyncSourceAssetPersistence:
    """Tests for #627 - asset is persisted before async processing.

    These tests hit the real create_source endpoint with mocked DB/command
    calls, verifying that the Source saved to the database has the correct
    asset set *before* async processing begins.
    """

    @pytest.mark.asyncio
    @patch("api.routers.sources.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.routers.sources.Source.add_to_project", new_callable=AsyncMock)
    @patch("api.routers.sources.Project.get", new_callable=AsyncMock)
    async def test_async_link_source_persists_url_asset(
        self, mock_nb_get, mock_add_nb, mock_submit, client
    ):
        """POST /sources with type=link and async_processing=true persists Asset(url=...)."""
        mock_nb_get.return_value = MagicMock()
        mock_submit.return_value = "command:123"

        saved_sources = []

        async def capture_save(self_source):
            saved_sources.append(self_source)
            self_source.id = "source:fake"
            self_source.command = None

        with patch.object(Source, "save", autospec=True, side_effect=capture_save):
            response = client.post(
                "/api/sources",
                data={
                    "type": "link",
                    "url": "https://example.com/article",
                    "projects": '["Project:1"]',
                    "async_processing": "true",
                },
            )

        assert response.status_code == 200
        assert len(saved_sources) >= 1

        source = saved_sources[0]
        assert source.asset is not None
        assert source.asset.url == "https://example.com/article"
        assert source.asset.file_path is None

    @pytest.mark.asyncio
    @patch("api.routers.sources.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.routers.sources.Source.add_to_project", new_callable=AsyncMock)
    @patch("api.routers.sources.Project.get", new_callable=AsyncMock)
    @patch("api.routers.sources.save_uploaded_file", new_callable=AsyncMock)
    async def test_async_upload_source_persists_file_asset(
        self, mock_upload, mock_nb_get, mock_add_nb, mock_submit, client
    ):
        """POST /sources with type=upload and async_processing=true persists Asset(file_path=...)."""
        mock_nb_get.return_value = MagicMock()
        mock_upload.return_value = os.path.join(os.path.abspath(UPLOADS_FOLDER), "video.mp4")
        mock_submit.return_value = "command:123"

        saved_sources = []

        async def capture_save(self_source):
            saved_sources.append(self_source)
            self_source.id = "source:fake"
            self_source.command = None

        with patch.object(Source, "save", autospec=True, side_effect=capture_save):
            response = client.post(
                "/api/sources",
                data={
                    "type": "upload",
                    "projects": '["Project:1"]',
                    "async_processing": "true",
                },
                files={"file": ("video.mp4", b"fake content", "video/mp4")},
            )

        assert response.status_code == 200
        assert len(saved_sources) >= 1

        source = saved_sources[0]
        assert source.asset is not None
        assert source.asset.file_path == os.path.join(os.path.abspath(UPLOADS_FOLDER), "video.mp4")
        assert source.asset.url is None

    @pytest.mark.asyncio
    @patch("api.routers.sources.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.routers.sources.Source.add_to_project", new_callable=AsyncMock)
    @patch("api.routers.sources.Project.get", new_callable=AsyncMock)
    async def test_async_text_source_has_no_asset(
        self, mock_nb_get, mock_add_nb, mock_submit, client
    ):
        """POST /sources with type=text and async_processing=true has asset=None."""
        mock_nb_get.return_value = MagicMock()
        mock_submit.return_value = "command:123"

        saved_sources = []

        async def capture_save(self_source):
            saved_sources.append(self_source)
            self_source.id = "source:fake"
            self_source.command = None

        with patch.object(Source, "save", autospec=True, side_effect=capture_save):
            response = client.post(
                "/api/sources",
                data={
                    "type": "text",
                    "content": "Some text content",
                    "projects": '["Project:1"]',
                    "async_processing": "true",
                },
            )

        assert response.status_code == 200
        assert len(saved_sources) >= 1

        source = saved_sources[0]
        assert source.asset is None


class TestRetrySourceProcessing:
    """POST /sources/{id}/retry must find a source's projects via the reference
    edge's in/out columns, not a non-existent `source` column (#861)."""

    @pytest.mark.asyncio
    @patch("api.routers.sources.CommandService.submit_command_job", new_callable=AsyncMock)
    @patch("api.routers.sources.repo_query", new_callable=AsyncMock)
    @patch("api.routers.sources.Source.get", new_callable=AsyncMock)
    async def test_retry_finds_projects_and_requeues(
        self, mock_get, mock_repo_query, mock_submit, client
    ):
        source = MagicMock()
        source.id = "source:1"
        source.command = None
        source.title = "My source"
        source.topics = []
        source.full_text = None
        source.asset = MagicMock(file_path=None, url="https://example.com/post")
        source.processing_failures = {
            "embedding": {
                "stage": "embedding",
                "message": "previous failure",
                "occurred_at": "2026-07-14T01:00:00Z",
            }
        }
        source.save = AsyncMock()
        source.get_embedded_chunks = AsyncMock(return_value=0)
        mock_get.return_value = source

        # The corrected query returns the linked Project(s)
        mock_repo_query.return_value = ["Project:1"]
        # submit_command_job returns str(RecordID), which already includes the
        # "command:" table prefix.
        mock_submit.return_value = "command:123"

        response = client.post("/api/sources/source:1/retry")

        assert response.status_code == 200
        # Regression guard: must query the reference edge by its `in` column
        called_query = mock_repo_query.await_args.args[0]
        assert "WHERE in = $source_id" in called_query
        assert "SELECT VALUE out FROM reference" in called_query
        # Regression guard: command_id must not be double-prefixed
        # (`command:command:…`), which previously raised a 500 on save.
        assert "command:command" not in str(source.command)
        assert str(source.command).count("command:") == 1
        assert str(source.command).startswith("command:")
        assert source.pipeline_stage == "extracting"
        assert source.embed_command is None
        assert source.kg_command is None
        assert (
            response.json()["processing_failures"]["embedding"]["message"]
            == "previous failure"
        )

    @pytest.mark.asyncio
    @patch("api.routers.sources.repo_query", new_callable=AsyncMock)
    @patch("api.routers.sources.Source.get", new_callable=AsyncMock)
    async def test_retry_400_only_when_truly_unlinked(
        self, mock_get, mock_repo_query, client
    ):
        source = MagicMock()
        source.id = "source:1"
        source.command = None
        mock_get.return_value = source
        mock_repo_query.return_value = []  # genuinely no projects

        response = client.post("/api/sources/source:1/retry")

        assert response.status_code == 400
        assert "not associated with any projects" in response.json()["detail"]


class TestGetSourceNotFound:
    """GET /sources/{id} must return 404 (not 500) for a missing/deleted source.
    `Source.get()` raises NotFoundError rather than returning None, so the handler
    must map it to 404 instead of catching it in its generic `except`."""

    @pytest.mark.asyncio
    @patch("api.routers.sources.Source.get", new_callable=AsyncMock)
    async def test_get_missing_source_returns_404(self, mock_get, client):
        from construction_os.exceptions import NotFoundError

        mock_get.side_effect = NotFoundError("source with id source:gone not found")

        response = client.get("/api/sources/source:gone")

        assert response.status_code == 404


class TestKnowledgeGraphReprocessing:
    @pytest.mark.asyncio
    @patch(
        "api.routers.knowledge_graph.begin_kg_stage",
        new_callable=AsyncMock,
        create=True,
    )
    @patch("api.routers.knowledge_graph.Source.get", new_callable=AsyncMock)
    async def test_extract_links_kg_command_to_source(
        self, mock_get, mock_begin_kg, client
    ):
        mock_get.return_value = MagicMock(id="source:1")
        mock_begin_kg.return_value = "command:kg"

        response = client.post(
            "/api/sources/source:1/knowledge/extract",
            json={"extractor": "generic", "force": True},
        )

        assert response.status_code == 200
        assert response.json()["command_id"] == "command:kg"
        mock_begin_kg.assert_awaited_once_with(
            "source:1",
            [],
            extractor="generic",
            force=True,
            auto_select=True,
        )

    @pytest.mark.asyncio
    @patch(
        "api.routers.knowledge_graph.begin_kg_stage",
        new_callable=AsyncMock,
    )
    @patch("api.routers.knowledge_graph.Project.get", new_callable=AsyncMock)
    async def test_project_rebuild_links_each_kg_command(
        self, mock_project_get, mock_begin_kg, client
    ):
        project = MagicMock()
        project.get_sources = AsyncMock(
            return_value=[
                MagicMock(id="source:one"),
                MagicMock(id="source:two"),
            ]
        )
        mock_project_get.return_value = project
        mock_begin_kg.side_effect = ["command:one", "command:two"]

        response = client.post(
            "/api/projects/project:1/knowledge/rebuild",
            json={"extractor": "generic", "force": True},
        )

        assert response.status_code == 200
        assert response.json()["jobs_submitted"] == 2
        assert mock_begin_kg.await_count == 2
        mock_begin_kg.assert_any_await(
            "source:one",
            ["project:1"],
            extractor="generic",
            force=True,
            auto_select=True,
        )


class TestSourceFailureDetails:
    @patch("construction_os.services.source_list.repo_query", new_callable=AsyncMock)
    @patch(
        "construction_os.services.source_list.heal_pipeline_stage_if_needed",
        new_callable=AsyncMock,
    )
    def test_source_list_returns_processing_failure_snapshots(
        self, _mock_heal, mock_repo_query, client
    ):
        mock_repo_query.return_value = [
            {
                "id": "source:one",
                "title": "Failed source",
                "topics": [],
                "asset": None,
                "embedded": False,
                "created": "2026-07-14T00:00:00Z",
                "updated": "2026-07-14T01:00:00Z",
                "command": {"id": "command:extract", "status": "completed"},
                "embed_command": {
                    "id": "command:embed",
                    "status": "completed",
                    "result": {"success": False, "error_message": "provider down"},
                },
                "kg_command": None,
                "pipeline_stage": "failed",
                "processing_failures": {
                    "embedding": {
                        "stage": "embedding",
                        "message": "provider down",
                        "error_type": "RuntimeError",
                        "occurred_at": "2026-07-14T01:00:00Z",
                        "command_id": "command:embed",
                    }
                },
            }
        ]

        response = client.get("/api/sources")

        assert response.status_code == 200
        payload = response.json()[0]
        assert payload["processing_failures"]["embedding"]["message"] == "provider down"
        assert payload["failure_details_unavailable"] is False

    @patch("api.routers.sources.Source.get", new_callable=AsyncMock)
    def test_source_status_marks_orphaned_failure_details_unavailable(
        self, mock_get, client
    ):
        source = MagicMock()
        source.id = "source:orphan"
        source.command = None
        source.embed_command = None
        source.kg_command = None
        source.pipeline_stage = "failed"
        source.processing_failures = {}
        mock_get.return_value = source

        response = client.get("/api/sources/source:orphan/status")

        assert response.status_code == 200
        assert response.json()["processing_failures"] == {}
        assert response.json()["failure_details_unavailable"] is True

    @patch("api.routers.sources.repo_query", new_callable=AsyncMock)
    @patch("api.routers.sources.Source.get", new_callable=AsyncMock)
    def test_source_detail_returns_processing_failures(
        self, mock_get, mock_repo_query, client
    ):
        source = MagicMock()
        source.id = "source:detail"
        source.title = "Detail"
        source.topics = []
        source.asset = None
        source.full_text = "text"
        source.command = None
        source.embed_command = None
        source.kg_command = None
        source.pipeline_stage = "failed"
        source.processing_failures = {
            "knowledge_graph": {
                "stage": "knowledge_graph",
                "message": "no relationships",
                "error_type": "ValueError",
                "occurred_at": "2026-07-14T01:00:00Z",
                "command_id": "command:kg",
            }
        }
        source.created = "2026-07-14T00:00:00Z"
        source.updated = "2026-07-14T01:00:00Z"
        source.get_embedded_chunks = AsyncMock(return_value=2)
        mock_get.return_value = source
        mock_repo_query.return_value = []

        response = client.get("/api/sources/source:detail")

        assert response.status_code == 200
        assert (
            response.json()["processing_failures"]["knowledge_graph"]["message"]
            == "no relationships"
        )

    @patch("api.routers.embedding.Source.get", new_callable=AsyncMock)
    @patch(
        "api.routers.embedding.model_manager.get_embedding_model",
        new_callable=AsyncMock,
    )
    def test_embedding_submission_error_is_sanitized(
        self, mock_model, mock_get, client
    ):
        mock_model.return_value = MagicMock()
        mock_get.side_effect = RuntimeError("queue api_key=secret-value")

        response = client.post(
            "/api/embed",
            json={
                "item_id": "source:one",
                "item_type": "source",
                "async_processing": True,
            },
        )

        assert response.status_code == 500
        assert "secret-value" not in response.json()["detail"]
        assert "[REDACTED]" in response.json()["detail"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

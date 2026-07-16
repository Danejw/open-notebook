from unittest.mock import AsyncMock, patch

import pytest
from construction_os.exceptions import NotFoundError
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client after environment variables have been cleared by conftest."""
    from api.main import app

    return TestClient(app)


class TestProjectArtifactCreation:
    """Test suite for project-artifacts API endpoints."""

    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_create_artifact_returns_command_id(self, mock_artifact_cls, client):
        """Creating a project artifact returns the embed command_id."""
        mock_artifact = AsyncMock()
        mock_artifact.id = "note:abc123"
        mock_artifact.title = "Test Artifact"
        mock_artifact.content = "Some content"
        mock_artifact.note_type = "manual"
        mock_artifact.artifact_kind = "manual"
        mock_artifact.created = "2026-01-01T00:00:00Z"
        mock_artifact.updated = "2026-01-01T00:00:00Z"
        mock_artifact.save.return_value = "command:embed123"
        mock_artifact.add_to_project = AsyncMock()
        mock_artifact_cls.return_value = mock_artifact

        response = client.post(
            "/api/project-artifacts",
            json={"content": "Some content", "artifact_kind": "manual"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] == "command:embed123"
        assert data["id"] == "note:abc123"
        assert data["artifact_kind"] == "manual"
        assert data["note_type"] == "manual"

    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_create_artifact_command_id_none_when_no_content_embedding(
        self, mock_artifact_cls, client
    ):
        """command_id is None when save returns None (no embedding)."""
        mock_artifact = AsyncMock()
        mock_artifact.id = "note:abc456"
        mock_artifact.title = "Empty Artifact"
        mock_artifact.content = "Some content"
        mock_artifact.note_type = "manual"
        mock_artifact.artifact_kind = "manual"
        mock_artifact.created = "2026-01-01T00:00:00Z"
        mock_artifact.updated = "2026-01-01T00:00:00Z"
        mock_artifact.save.return_value = None
        mock_artifact.add_to_project = AsyncMock()
        mock_artifact_cls.return_value = mock_artifact

        response = client.post(
            "/api/project-artifacts",
            json={"content": "Some content", "artifact_kind": "manual"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] is None

    @patch("api.routers.project_artifacts._generate_artifact_title", new_callable=AsyncMock)
    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_create_generated_artifact_auto_generates_title(
        self, mock_artifact_cls, mock_generate_title, client
    ):
        """Generated artifacts without a title get an LLM-generated title from content."""
        mock_generate_title.return_value = "Bid Scope Summary for Kona BBQ"

        mock_artifact = AsyncMock()
        mock_artifact.id = "note:generated123"
        mock_artifact.title = "Bid Scope Summary for Kona BBQ"
        mock_artifact.content = "Detailed scope breakdown for the kitchen renovation."
        mock_artifact.note_type = "generated"
        mock_artifact.artifact_kind = "generated"
        mock_artifact.created = "2026-01-01T00:00:00Z"
        mock_artifact.updated = "2026-01-01T00:00:00Z"
        mock_artifact.save.return_value = None
        mock_artifact.add_to_project = AsyncMock()
        mock_artifact_cls.return_value = mock_artifact

        response = client.post(
            "/api/project-artifacts",
            json={
                "content": "Detailed scope breakdown for the kitchen renovation.",
                "artifact_kind": "generated",
            },
        )

        assert response.status_code == 200
        mock_generate_title.assert_awaited_once_with(
            "Detailed scope breakdown for the kitchen renovation.",
            "generated",
        )
        data = response.json()
        assert data["title"] == "Bid Scope Summary for Kona BBQ"
        assert data["artifact_kind"] == "generated"
        assert mock_artifact_cls.call_args.kwargs["note_type"] == "generated"

    @patch("api.routers.project_artifacts._generate_artifact_title", new_callable=AsyncMock)
    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_create_ai_artifact_auto_generates_title(
        self, mock_artifact_cls, mock_generate_title, client
    ):
        """AI artifacts without a title also get an auto-generated title."""
        mock_generate_title.return_value = "Chat Capture Summary"

        mock_artifact = AsyncMock()
        mock_artifact.id = "note:ai123"
        mock_artifact.title = "Chat Capture Summary"
        mock_artifact.content = "Key points from the conversation."
        mock_artifact.note_type = "ai"
        mock_artifact.artifact_kind = "ai"
        mock_artifact.created = "2026-01-01T00:00:00Z"
        mock_artifact.updated = "2026-01-01T00:00:00Z"
        mock_artifact.save.return_value = None
        mock_artifact.add_to_project = AsyncMock()
        mock_artifact_cls.return_value = mock_artifact

        response = client.post(
            "/api/project-artifacts",
            json={
                "content": "Key points from the conversation.",
                "artifact_kind": "ai",
            },
        )

        assert response.status_code == 200
        mock_generate_title.assert_awaited_once_with(
            "Key points from the conversation.",
            "ai",
        )
        assert response.json()["artifact_kind"] == "ai"


class TestNotesAliasSmoke:
    """Deprecated /notes routes delegate to project-artifacts handlers."""

    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_create_note_alias_returns_command_id(self, mock_artifact_cls, client):
        mock_artifact = AsyncMock()
        mock_artifact.id = "note:alias123"
        mock_artifact.title = "Alias Artifact"
        mock_artifact.content = "Alias content"
        mock_artifact.note_type = "manual"
        mock_artifact.artifact_kind = "manual"
        mock_artifact.created = "2026-01-01T00:00:00Z"
        mock_artifact.updated = "2026-01-01T00:00:00Z"
        mock_artifact.save.return_value = "command:embed999"
        mock_artifact.add_to_project = AsyncMock()
        mock_artifact_cls.return_value = mock_artifact

        response = client.post(
            "/api/notes",
            json={"content": "Alias content", "note_type": "manual"},
        )

        assert response.status_code == 200
        assert response.json()["command_id"] == "command:embed999"


class TestProjectArtifactUpdate:
    """Test suite for project artifact update endpoint."""

    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_update_artifact_returns_command_id(self, mock_artifact_cls, client):
        """Updating a project artifact returns the embed command_id."""
        mock_artifact = AsyncMock()
        mock_artifact.id = "note:abc123"
        mock_artifact.title = "Test Artifact"
        mock_artifact.content = "Original content"
        mock_artifact.note_type = "manual"
        mock_artifact.artifact_kind = "manual"
        mock_artifact.created = "2026-01-01T00:00:00Z"
        mock_artifact.updated = "2026-01-01T00:00:00Z"
        mock_artifact.save.return_value = "command:embed789"
        mock_artifact_cls.get = AsyncMock(return_value=mock_artifact)

        response = client.put(
            "/api/project-artifacts/note:abc123",
            json={"content": "Updated content"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] == "command:embed789"

    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_update_artifact_command_id_none_when_no_embedding(
        self, mock_artifact_cls, client
    ):
        """command_id is None on update when no embedding is triggered."""
        mock_artifact = AsyncMock()
        mock_artifact.id = "note:abc123"
        mock_artifact.title = "Test Artifact"
        mock_artifact.content = "Some content"
        mock_artifact.note_type = "manual"
        mock_artifact.artifact_kind = "manual"
        mock_artifact.created = "2026-01-01T00:00:00Z"
        mock_artifact.updated = "2026-01-01T00:00:00Z"
        mock_artifact.save.return_value = None
        mock_artifact_cls.get = AsyncMock(return_value=mock_artifact)

        response = client.put(
            "/api/project-artifacts/note:abc123",
            json={"title": "Updated Title"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] is None


class TestProjectArtifactPdfExport:
    """Test suite for generated artifact PDF export endpoint."""

    @patch("api.routers.project_artifacts.render_note_pdf")
    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_export_generated_pdf_success(self, mock_artifact_cls, mock_render_pdf, client):
        """Generated artifacts export as application/pdf with non-empty body."""
        mock_artifact = AsyncMock()
        mock_artifact.title = "Bid Scope Summary"
        mock_artifact.content = "# Scope\n\nDetailed breakdown."
        mock_artifact.note_type = "generated"
        mock_artifact.artifact_kind = "generated"
        mock_artifact.updated = "2026-01-15T12:00:00Z"
        mock_artifact_cls.get = AsyncMock(return_value=mock_artifact)
        mock_render_pdf.return_value = b"%PDF-1.4 test content"

        response = client.get("/api/project-artifacts/note:generated123/export/pdf")

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
        assert 'filename="bid-scope-summary.pdf"' in response.headers.get(
            "content-disposition", ""
        )
        mock_render_pdf.assert_called_once_with(
            title="Bid Scope Summary",
            content="# Scope\n\nDetailed breakdown.",
            updated="2026-01-15T12:00:00Z",
        )

    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_export_pdf_artifact_not_found(self, mock_artifact_cls, client):
        """Missing artifacts return 404."""
        mock_artifact_cls.get = AsyncMock(side_effect=NotFoundError("Project artifact not found"))

        response = client.get("/api/project-artifacts/note:missing/export/pdf")

        assert response.status_code == 404

    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_export_pdf_rejects_non_generated(self, mock_artifact_cls, client):
        """Only generated artifacts can be exported as PDF."""
        mock_artifact = AsyncMock()
        mock_artifact.title = "Manual Artifact"
        mock_artifact.content = "Some content"
        mock_artifact.note_type = "manual"
        mock_artifact.artifact_kind = "manual"
        mock_artifact.updated = "2026-01-15T12:00:00Z"
        mock_artifact_cls.get = AsyncMock(return_value=mock_artifact)

        response = client.get("/api/project-artifacts/note:abc123/export/pdf")

        assert response.status_code == 400
        assert "generated" in response.json()["detail"].lower()

    @patch("api.routers.project_artifacts.render_note_pdf")
    @patch("api.routers.project_artifacts.ProjectArtifact")
    def test_export_pdf_notes_alias_smoke(self, mock_artifact_cls, mock_render_pdf, client):
        """Deprecated /notes PDF export still works for generated artifacts."""
        mock_artifact = AsyncMock()
        mock_artifact.title = "Generated Output"
        mock_artifact.content = "Output body"
        mock_artifact.note_type = "generated"
        mock_artifact.artifact_kind = "generated"
        mock_artifact.updated = "2026-01-15T12:00:00Z"
        mock_artifact_cls.get = AsyncMock(return_value=mock_artifact)
        mock_render_pdf.return_value = b"%PDF-1.4 alias"

        response = client.get("/api/notes/note:generated123/export/pdf")

        assert response.status_code == 200
        assert response.content.startswith(b"%PDF")

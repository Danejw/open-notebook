from unittest.mock import AsyncMock, patch

import pytest
from construction_os.exceptions import NotFoundError
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client after environment variables have been cleared by conftest."""
    from api.main import app

    return TestClient(app)


class TestNoteCreation:
    """Test suite for Note API endpoints."""

    @patch("api.routers.notes.Note")
    def test_create_note_returns_command_id(self, mock_note_cls, client):
        """Test that creating a note returns the embed command_id."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc123"
        mock_note.title = "Test Note"
        mock_note.content = "Some content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = "command:embed123"
        mock_note.add_to_project = AsyncMock()
        mock_note_cls.return_value = mock_note

        response = client.post(
            "/api/notes",
            json={"content": "Some content", "note_type": "human"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] == "command:embed123"
        assert data["id"] == "note:abc123"

    @patch("api.routers.notes.Note")
    def test_create_note_command_id_none_when_no_content_embedding(
        self, mock_note_cls, client
    ):
        """Test that command_id is None when save returns None (no embedding)."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc456"
        mock_note.title = "Empty Note"
        mock_note.content = "Some content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = None
        mock_note.add_to_project = AsyncMock()
        mock_note_cls.return_value = mock_note

        response = client.post(
            "/api/notes",
            json={"content": "Some content", "note_type": "human"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] is None

    @patch("api.routers.notes._generate_note_title", new_callable=AsyncMock)
    @patch("api.routers.notes.Note")
    def test_create_artifact_note_auto_generates_title(
        self, mock_note_cls, mock_generate_title, client
    ):
        """Artifact notes without a title get an LLM-generated title from content."""
        mock_generate_title.return_value = "Bid Scope Summary for Kona BBQ"

        mock_note = AsyncMock()
        mock_note.id = "note:artifact123"
        mock_note.title = "Bid Scope Summary for Kona BBQ"
        mock_note.content = "Detailed scope breakdown for the kitchen renovation."
        mock_note.note_type = "artifact"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = None
        mock_note.add_to_project = AsyncMock()
        mock_note_cls.return_value = mock_note

        response = client.post(
            "/api/notes",
            json={
                "content": "Detailed scope breakdown for the kitchen renovation.",
                "note_type": "artifact",
            },
        )

        assert response.status_code == 200
        mock_generate_title.assert_awaited_once_with(
            "Detailed scope breakdown for the kitchen renovation.",
            "artifact",
        )
        data = response.json()
        assert data["title"] == "Bid Scope Summary for Kona BBQ"
        assert mock_note_cls.call_args.kwargs["title"] == "Bid Scope Summary for Kona BBQ"


class TestNoteUpdate:
    """Test suite for Note update endpoint."""

    @patch("api.routers.notes.Note")
    def test_update_note_returns_command_id(self, mock_note_cls, client):
        """Test that updating a note returns the embed command_id."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc123"
        mock_note.title = "Test Note"
        mock_note.content = "Original content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = "command:embed789"
        mock_note_cls.get = AsyncMock(return_value=mock_note)

        response = client.put(
            "/api/notes/note:abc123",
            json={"content": "Updated content"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] == "command:embed789"

    @patch("api.routers.notes.Note")
    def test_update_note_command_id_none_when_no_embedding(
        self, mock_note_cls, client
    ):
        """Test that command_id is None on update when no embedding is triggered."""
        mock_note = AsyncMock()
        mock_note.id = "note:abc123"
        mock_note.title = "Test Note"
        mock_note.content = "Some content"
        mock_note.note_type = "human"
        mock_note.created = "2026-01-01T00:00:00Z"
        mock_note.updated = "2026-01-01T00:00:00Z"
        mock_note.save.return_value = None
        mock_note_cls.get = AsyncMock(return_value=mock_note)

        response = client.put(
            "/api/notes/note:abc123",
            json={"title": "Updated Title"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["command_id"] is None


class TestNotePdfExport:
    """Test suite for artifact PDF export endpoint."""

    @patch("api.routers.notes.render_note_pdf")
    @patch("api.routers.notes.Note")
    def test_export_artifact_pdf_success(self, mock_note_cls, mock_render_pdf, client):
        """Artifact notes export as application/pdf with non-empty body."""
        mock_note = AsyncMock()
        mock_note.title = "Bid Scope Summary"
        mock_note.content = "# Scope\n\nDetailed breakdown."
        mock_note.note_type = "artifact"
        mock_note.updated = "2026-01-15T12:00:00Z"
        mock_note_cls.get = AsyncMock(return_value=mock_note)
        mock_render_pdf.return_value = b"%PDF-1.4 test content"

        response = client.get("/api/notes/note:artifact123/export/pdf")

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

    @patch("api.routers.notes.Note")
    def test_export_pdf_note_not_found(self, mock_note_cls, client):
        """Missing notes return 404."""
        mock_note_cls.get = AsyncMock(side_effect=NotFoundError("Note not found"))

        response = client.get("/api/notes/note:missing/export/pdf")

        assert response.status_code == 404

    @patch("api.routers.notes.Note")
    def test_export_pdf_rejects_non_artifact(self, mock_note_cls, client):
        """Non-artifact notes cannot be exported as PDF."""
        mock_note = AsyncMock()
        mock_note.title = "Human Note"
        mock_note.content = "Some content"
        mock_note.note_type = "human"
        mock_note.updated = "2026-01-15T12:00:00Z"
        mock_note_cls.get = AsyncMock(return_value=mock_note)

        response = client.get("/api/notes/note:abc123/export/pdf")

        assert response.status_code == 400
        assert "artifact" in response.json()["detail"].lower()

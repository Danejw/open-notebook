"""API tests for HTML-native bid templates and documents."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from construction_os.exceptions import NotFoundError
from fastapi.testclient import TestClient

SAMPLE_HTML = """<html><body>
<p>Trade: <span id="trade">Carpentry</span></p>
<p>Total: <span class="amt">$12,000</span></p>
</body></html>"""


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


def _mock_template(**overrides):
    template = MagicMock()
    template.id = overrides.get("id", "html_template:t1")
    template.name = overrides.get("name", "KCDBC Bid")
    template.category = overrides.get("category", "estimate")
    template.html_body = overrides.get("html_body", SAMPLE_HTML)
    template.created = "2026-07-13T00:00:00Z"
    template.updated = "2026-07-13T00:00:00Z"
    template.save = AsyncMock()
    template.delete = AsyncMock()
    return template


def _mock_document(**overrides):
    document = MagicMock()
    document.id = overrides.get("id", "document:d1")
    document.project_id = overrides.get("project_id", "project:p1")
    document.template_id = overrides.get("template_id", "html_template:t1")
    document.title = overrides.get("title", "KCDBC Bid")
    document.scenario_label = overrides.get("scenario_label", "Base")
    document.html_body = overrides.get("html_body", SAMPLE_HTML)
    document.parent_document_id = overrides.get("parent_document_id")
    document.created = "2026-07-13T00:00:00Z"
    document.updated = "2026-07-13T00:00:00Z"
    document.save = AsyncMock()
    document.delete = AsyncMock()
    return document


class TestHtmlTemplatesApi:
    @patch("api.routers.html_documents.HtmlTemplate")
    def test_create_template_rejects_non_html(self, mock_cls, client):
        response = client.post(
            "/api/templates/html",
            json={"name": "Bad", "html_body": "not html at all"},
        )
        assert response.status_code == 400
        mock_cls.assert_not_called()

    @patch("api.routers.html_documents.HtmlTemplate")
    def test_create_template_success(self, mock_cls, client):
        mock_template = _mock_template()
        mock_cls.return_value = mock_template

        response = client.post(
            "/api/templates/html",
            json={"name": "KCDBC Bid", "category": "estimate", "html_body": SAMPLE_HTML},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "KCDBC Bid"
        assert data["html_body"] == SAMPLE_HTML
        mock_template.save.assert_awaited()


class TestHtmlDocumentsApi:
    @patch("api.routers.html_documents.HtmlTemplate")
    @patch("api.routers.html_documents.Project")
    @patch("api.routers.html_documents.Document")
    def test_create_document_from_template(
        self, mock_doc_cls, mock_project_cls, mock_template_cls, client
    ):
        mock_project_cls.get = AsyncMock(return_value=MagicMock())
        mock_template_cls.get = AsyncMock(return_value=_mock_template())
        mock_doc = _mock_document()
        mock_doc_cls.return_value = mock_doc

        response = client.post(
            "/api/projects/project:p1/documents",
            json={"template_id": "html_template:t1"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["scenario_label"] == "Base"
        assert data["html_body"] == SAMPLE_HTML
        mock_doc.save.assert_awaited()

    @patch("api.routers.html_documents.HtmlTemplate")
    @patch("api.routers.html_documents.Project")
    @patch("api.routers.html_documents.Document")
    def test_create_document_with_filled_html_body(
        self, mock_doc_cls, mock_project_cls, mock_template_cls, client
    ):
        filled = SAMPLE_HTML.replace("Carpentry", "Mechanical").replace(
            "$12,000", "$9,500"
        )
        mock_project_cls.get = AsyncMock(return_value=MagicMock())
        mock_template_cls.get = AsyncMock(return_value=_mock_template())
        mock_doc = _mock_document(html_body=filled, scenario_label="Chat")
        mock_doc_cls.return_value = mock_doc

        response = client.post(
            "/api/projects/project:p1/documents",
            json={
                "template_id": "html_template:t1",
                "scenario_label": "Chat",
                "html_body": filled,
            },
        )
        assert response.status_code == 200
        assert response.json()["scenario_label"] == "Chat"
        assert "Mechanical" in response.json()["html_body"]
        # Constructor should receive the filled body, not the template copy
        call_kwargs = mock_doc_cls.call_args.kwargs
        assert call_kwargs["html_body"] == filled
        assert call_kwargs["scenario_label"] == "Chat"
        mock_doc.save.assert_awaited()

    @patch("api.routers.html_documents.Document")
    def test_patch_span_updates(self, mock_doc_cls, client):
        mock_doc = _mock_document()
        mock_doc_cls.get = AsyncMock(return_value=mock_doc)

        response = client.patch(
            "/api/documents/document:d1",
            json={"span_updates": {"0": "Mechanical", "1": "$9,500"}},
        )
        assert response.status_code == 200
        assert "Mechanical" in mock_doc.html_body
        assert "$9,500" in mock_doc.html_body
        mock_doc.save.assert_awaited()

    @patch("api.routers.html_documents.Document")
    def test_patch_html_rejects_structure_change(self, mock_doc_cls, client):
        mock_doc = _mock_document()
        mock_doc_cls.get = AsyncMock(return_value=mock_doc)
        bad_html = SAMPLE_HTML.replace(
            '<span id="trade">Carpentry</span>', "<div>Carpentry</div>"
        )

        response = client.patch(
            "/api/documents/document:d1",
            json={"html_body": bad_html, "allow_structure_change": False},
        )
        assert response.status_code == 400

    @patch("api.routers.html_documents.Document")
    def test_duplicate_document(self, mock_doc_cls, client):
        source = _mock_document()
        mock_doc_cls.get = AsyncMock(return_value=source)
        duplicate = _mock_document(
            id="document:d2",
            scenario_label="Alt A",
            parent_document_id="document:d1",
        )
        mock_doc_cls.return_value = duplicate

        response = client.post(
            "/api/documents/document:d1/duplicate",
            json={"scenario_label": "Alt A"},
        )
        assert response.status_code == 200
        assert response.json()["scenario_label"] == "Alt A"
        duplicate.save.assert_awaited()

    @patch("api.routers.html_documents.render_html_pdf")
    @patch("api.routers.html_documents.Document")
    def test_export_pdf(self, mock_doc_cls, mock_render, client):
        mock_doc_cls.get = AsyncMock(return_value=_mock_document(title="Bid Summary"))
        mock_render.return_value = b"%PDF-1.4 test"

        response = client.get("/api/documents/document:d1/export.pdf")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
        mock_render.assert_called_once()

    @patch("api.routers.html_documents.render_html_pdf")
    def test_render_pdf_from_html(self, mock_render, client):
        mock_render.return_value = b"%PDF-1.4 chat"

        response = client.post(
            "/api/documents/render.pdf",
            json={"html_body": SAMPLE_HTML, "title": "Chat Bid"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
        mock_render.assert_called_once_with(SAMPLE_HTML)

    def test_render_pdf_rejects_non_html(self, client):
        response = client.post(
            "/api/documents/render.pdf",
            json={"html_body": "not html", "title": "Bad"},
        )
        assert response.status_code == 400

    @patch("api.routers.html_documents.Document")
    def test_get_document_not_found(self, mock_doc_cls, client):
        mock_doc_cls.get = AsyncMock(side_effect=NotFoundError("missing"))
        response = client.get("/api/documents/document:missing")
        assert response.status_code == 404

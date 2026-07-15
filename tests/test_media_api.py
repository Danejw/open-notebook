"""API tests for the global media asset library."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from construction_os.exceptions import NotFoundError
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


def _mock_asset(**overrides):
    asset = MagicMock()
    asset.id = overrides.get("id", "media_asset:m1")
    asset.name = overrides.get("name", "Company Logo")
    asset.slug = overrides.get("slug", "company-logo")
    asset.file_path = overrides.get("file_path", "/tmp/logo.png")
    asset.mime_type = overrides.get("mime_type", "image/png")
    asset.byte_size = overrides.get("byte_size", 12)
    asset.created = "2026-07-14T00:00:00Z"
    asset.updated = "2026-07-14T00:00:00Z"
    asset.save = AsyncMock()
    asset.delete = AsyncMock()
    return asset


class TestMediaApi:
    @patch("api.routers.media.MediaAsset")
    def test_list_media(self, mock_cls, client):
        mock_cls.get_all = AsyncMock(return_value=[_mock_asset()])
        response = client.get("/api/media")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["slug"] == "company-logo"
        assert data[0]["file_url"] == "/api/media/media_asset:m1/file"

    @patch("api.routers.media.unique_slug", new_callable=AsyncMock)
    @patch("api.routers.media._save_media_upload", new_callable=AsyncMock)
    @patch("api.routers.media.MediaAsset")
    def test_upload_media(self, mock_cls, mock_save, mock_slug, client):
        mock_save.return_value = ("/data/media/logo.png", "image/png", 4)
        mock_slug.return_value = "logo"
        asset = _mock_asset(id="media_asset:new", name="logo", slug="logo")
        mock_cls.return_value = asset

        response = client.post(
            "/api/media",
            files={"file": ("logo.png", b"\x89PNG", "image/png")},
        )
        assert response.status_code == 200
        assert response.json()["slug"] == "logo"
        asset.save.assert_awaited()

    @patch("api.routers.media._resolve_mime")
    def test_upload_rejects_non_image(self, mock_mime, client):
        from construction_os.exceptions import InvalidInputError

        mock_mime.side_effect = InvalidInputError(
            "Only image uploads are allowed (PNG, JPG, WebP, SVG, GIF)"
        )
        response = client.post(
            "/api/media",
            files={"file": ("notes.txt", b"hello", "text/plain")},
        )
        assert response.status_code == 400

    @patch("api.routers.media.MediaAsset")
    def test_get_by_slug(self, mock_cls, client):
        mock_cls.get_by_slug = AsyncMock(return_value=_mock_asset())
        response = client.get("/api/media/by-slug/company-logo")
        assert response.status_code == 200
        assert response.json()["name"] == "Company Logo"

    @patch("api.routers.media.MediaAsset")
    def test_get_by_slug_not_found(self, mock_cls, client):
        mock_cls.get_by_slug = AsyncMock(side_effect=NotFoundError("missing"))
        response = client.get("/api/media/by-slug/missing")
        assert response.status_code == 404

    @patch("api.routers.media.MediaAsset")
    def test_patch_rename(self, mock_cls, client):
        asset = _mock_asset()
        mock_cls.get = AsyncMock(return_value=asset)
        mock_cls.slug_exists = AsyncMock(return_value=False)

        response = client.patch(
            "/api/media/media_asset:m1",
            json={"name": "New Logo", "slug": "new-logo"},
        )
        assert response.status_code == 200
        assert asset.name == "New Logo"
        assert asset.slug == "new-logo"
        asset.save.assert_awaited()

    @patch("api.routers.media.os.unlink")
    @patch("api.routers.media._confine_media_path")
    @patch("api.routers.media.MediaAsset")
    def test_delete_media(self, mock_cls, mock_confine, mock_unlink, client):
        asset = _mock_asset(file_path="/data/media/logo.png")
        mock_cls.get = AsyncMock(return_value=asset)
        mock_confine.return_value = "/data/media/logo.png"

        response = client.delete("/api/media/media_asset:m1")
        assert response.status_code == 200
        asset.delete.assert_awaited()
        mock_unlink.assert_called_once_with("/data/media/logo.png")

    @patch("api.routers.media._confine_media_path")
    @patch("api.routers.media.MediaAsset")
    def test_serve_file(self, mock_cls, mock_confine, client, tmp_path):
        file_path = tmp_path / "logo.png"
        file_path.write_bytes(b"\x89PNG")
        asset = _mock_asset(file_path=str(file_path), mime_type="image/png")
        mock_cls.get = AsyncMock(return_value=asset)
        mock_confine.return_value = str(file_path)

        response = client.get("/api/media/media_asset:m1/file")
        assert response.status_code == 200
        assert response.content == b"\x89PNG"
        assert "image/png" in response.headers.get("content-type", "")


def test_confine_media_path_blocks_traversal(tmp_path, monkeypatch):
    from api.routers import media as media_router
    from fastapi import HTTPException

    media_dir = tmp_path / "media"
    media_dir.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("nope")
    monkeypatch.setattr(media_router, "MEDIA_FOLDER", str(media_dir))

    with pytest.raises(HTTPException) as exc:
        media_router._confine_media_path(str(outside))
    assert exc.value.status_code == 403


def test_resolve_mime_accepts_png():
    from api.routers.media import _resolve_mime

    upload = MagicMock()
    upload.content_type = "image/png"
    assert _resolve_mime(upload, "logo.png") == "image/png"


def test_resolve_mime_rejects_txt():
    from api.routers.media import _resolve_mime
    from construction_os.exceptions import InvalidInputError

    upload = MagicMock()
    upload.content_type = "text/plain"
    with pytest.raises(InvalidInputError):
        _resolve_mime(upload, "notes.txt")

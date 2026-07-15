"""Tests for HTML media token expansion and PDF data-URL inlining."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from construction_os.exceptions import NotFoundError
from construction_os.utils.html_media import (
    expand_image_tokens,
    inline_media_as_data_urls,
    resolve_media_for_pdf,
    restore_template_media,
)


def _asset(**overrides):
    asset = MagicMock()
    asset.id = overrides.get("id", "media_asset:m1")
    asset.name = overrides.get("name", "Company Logo")
    asset.slug = overrides.get("slug", "company-logo")
    asset.file_path = overrides.get("file_path", "")
    asset.mime_type = overrides.get("mime_type", "image/png")
    return asset


@pytest.mark.asyncio
async def test_expand_image_tokens_replaces_known_slug():
    asset = _asset()
    with patch(
        "construction_os.utils.html_media.MediaAsset.get_by_slug",
        new=AsyncMock(return_value=asset),
    ):
        html = "<p>Logo {{image:company-logo}} here</p>"
        result = await expand_image_tokens(html)
    assert "/api/media/media_asset:m1/file" in result
    assert 'data-media-slug="company-logo"' in result
    assert "{{image:company-logo}}" not in result


@pytest.mark.asyncio
async def test_expand_image_tokens_unknown_slug_placeholder():
    with patch(
        "construction_os.utils.html_media.MediaAsset.get_by_slug",
        new=AsyncMock(side_effect=NotFoundError("missing")),
    ):
        result = await expand_image_tokens("<div>{{image:missing-logo}}</div>")
    assert "Missing image: missing-logo" in result
    assert 'data-media-missing="true"' in result


@pytest.mark.asyncio
async def test_inline_media_as_data_urls(tmp_path, monkeypatch):
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    file_path = media_dir / "logo.png"
    file_path.write_bytes(b"\x89PNG\r\n\x1a\n")

    monkeypatch.setattr(
        "construction_os.utils.html_media.MEDIA_FOLDER", str(media_dir)
    )
    asset = _asset(file_path=str(file_path))
    with patch(
        "construction_os.utils.html_media.MediaAsset.get",
        new=AsyncMock(return_value=asset),
    ):
        html = '<img src="/api/media/media_asset:m1/file" alt="Logo" />'
        result = await inline_media_as_data_urls(html)

    assert 'src="data:image/png;base64,' in result
    assert "/api/media/" not in result


@pytest.mark.asyncio
async def test_resolve_media_for_pdf_tokens_then_inline(tmp_path, monkeypatch):
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    file_path = media_dir / "logo.png"
    file_path.write_bytes(b"abc123")

    monkeypatch.setattr(
        "construction_os.utils.html_media.MEDIA_FOLDER", str(media_dir)
    )
    asset = _asset(file_path=str(file_path), mime_type="image/png")

    with (
        patch(
            "construction_os.utils.html_media.MediaAsset.get_by_slug",
            new=AsyncMock(return_value=asset),
        ),
        patch(
            "construction_os.utils.html_media.MediaAsset.get",
            new=AsyncMock(return_value=asset),
        ),
    ):
        result = await resolve_media_for_pdf(
            "<html><body>{{image:company-logo}}</body></html>"
        )

    assert "data:image/png;base64," in result
    assert "{{image:" not in result


def test_restore_template_media_replaces_relative_logo():
    template = (
        '<html><body><img src="/api/media/media_asset:m1/file" '
        'alt="Logo" data-media-slug="company-logo" />'
        "<span>Title</span></body></html>"
    )
    filled = (
        '<html><body><img src="logo.png" alt="Logo" />'
        "<span>Filled</span></body></html>"
    )
    result = restore_template_media(filled, template)
    assert '/api/media/media_asset:m1/file' in result
    assert 'data-media-slug="company-logo"' in result
    assert "<span>Filled</span>" in result
    assert "logo.png" not in result


def test_restore_template_media_keeps_good_src():
    tag = '<img src="/api/media/media_asset:m1/file" data-media-slug="a" />'
    assert restore_template_media(tag, tag) == tag

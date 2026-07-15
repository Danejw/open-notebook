"""Resolve template image tokens and inline media assets for PDF export."""

from __future__ import annotations

import base64
import os
import re
from pathlib import Path
from typing import Optional

from loguru import logger

from construction_os.config import MEDIA_FOLDER
from construction_os.domain.media_asset import MediaAsset
from construction_os.exceptions import NotFoundError

# {{image:company-logo}} or {{ image: company-logo }}
IMAGE_TOKEN_RE = re.compile(
    r"\{\{\s*image\s*:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*\}\}",
    re.IGNORECASE,
)

# /api/media/{id}/file — id may be "media_asset:xyz" URL-encoded or plain
MEDIA_SRC_RE = re.compile(
    r"""(?P<prefix>src\s*=\s*["'])(?P<url>(?:https?://[^"'/]+)?/api/media/(?P<id>[^/"']+)/file)(?P<suffix>["'])""",
    re.IGNORECASE,
)

IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
IMG_SRC_RE = re.compile(r"""src\s*=\s*["']([^"']*)["']""", re.IGNORECASE)


def media_file_url(asset_id: str) -> str:
    """Stable relative API path for an asset file."""
    return f"/api/media/{asset_id}/file"


def img_tag_for_asset(asset: MediaAsset) -> str:
    """Build an img tag that references a library asset."""
    asset_id = asset.id or ""
    alt = (asset.name or asset.slug or "image").replace('"', "&quot;")
    return (
        f'<img src="{media_file_url(asset_id)}" '
        f'alt="{alt}" data-media-slug="{asset.slug}" />'
    )


def placeholder_img(slug: str) -> str:
    """Visible placeholder when a token slug cannot be resolved."""
    safe = slug.replace('"', "&quot;")
    return (
        f'<img src="" alt="Missing image: {safe}" '
        f'data-media-slug="{safe}" data-media-missing="true" />'
    )


async def expand_image_tokens(html_body: str) -> str:
    """Replace {{image:slug}} tokens with img tags pointing at /api/media/.../file."""
    if not html_body or "{{" not in html_body:
        return html_body or ""

    matches = list(IMAGE_TOKEN_RE.finditer(html_body))
    if not matches:
        return html_body

    # Resolve unique slugs once
    slugs = {m.group(1).lower() for m in matches}
    resolved: dict[str, Optional[MediaAsset]] = {}
    for slug in slugs:
        try:
            resolved[slug] = await MediaAsset.get_by_slug(slug)
        except NotFoundError:
            resolved[slug] = None
            logger.warning(f"Unknown image token slug: {slug}")

    def repl(match: re.Match[str]) -> str:
        slug = match.group(1).lower()
        asset = resolved.get(slug)
        if asset is None:
            return placeholder_img(slug)
        return img_tag_for_asset(asset)

    return IMAGE_TOKEN_RE.sub(repl, html_body)


def _file_to_data_url(file_path: str, mime_type: str) -> Optional[str]:
    """Read a confined media file and return a data URL, or None on failure."""
    try:
        safe_root = os.path.realpath(MEDIA_FOLDER)
        resolved = os.path.realpath(file_path)
        if not resolved.startswith(safe_root + os.sep):
            logger.warning(f"Refusing to inline media outside MEDIA_FOLDER: {file_path}")
            return None
        if not os.path.isfile(resolved):
            logger.warning(f"Media file missing for PDF inline: {file_path}")
            return None
        raw = Path(resolved).read_bytes()
        encoded = base64.b64encode(raw).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"
    except OSError as e:
        logger.warning(f"Failed to read media file for PDF: {file_path}: {e}")
        return None


async def _asset_to_data_url(asset: MediaAsset) -> Optional[str]:
    return _file_to_data_url(asset.file_path, asset.mime_type)


async def inline_media_as_data_urls(html_body: str) -> str:
    """Rewrite /api/media/{id}/file src attributes to data: URLs for PDF export."""
    if not html_body:
        return html_body or ""

    matches = list(MEDIA_SRC_RE.finditer(html_body))
    if not matches:
        return html_body

    # Collect unique asset ids from src URLs
    id_map: dict[str, Optional[str]] = {}
    for match in matches:
        asset_id = match.group("id")
        if asset_id in id_map:
            continue
        try:
            asset = await MediaAsset.get(asset_id)
            id_map[asset_id] = await _asset_to_data_url(asset)
        except NotFoundError:
            id_map[asset_id] = None
            logger.warning(f"Media asset not found for PDF inline: {asset_id}")

    def repl(match: re.Match[str]) -> str:
        asset_id = match.group("id")
        data_url = id_map.get(asset_id)
        if not data_url:
            return match.group(0)
        return f'{match.group("prefix")}{data_url}{match.group("suffix")}'

    return MEDIA_SRC_RE.sub(repl, html_body)


async def resolve_media_for_pdf(html_body: str) -> str:
    """Expand image tokens then inline library media as data URLs for Chromium PDF."""
    expanded = await expand_image_tokens(html_body or "")
    return await inline_media_as_data_urls(expanded)


async def resolve_media_for_preview(html_body: str) -> str:
    """Expand image tokens to stable /api/media/.../file URLs (keep refs for editing)."""
    return await expand_image_tokens(html_body or "")


def _img_src(tag: str) -> str:
    match = IMG_SRC_RE.search(tag or "")
    return (match.group(1) if match else "").strip()


def _is_resolvable_media_src(src: str) -> bool:
    """True when src can be shown/exported without restoring from the template."""
    if not src:
        return False
    if src.startswith("data:"):
        return True
    if "/api/media/" in src and "/file" in src:
        return True
    if src.startswith("http://") or src.startswith("https://"):
        return True
    return False


def restore_template_media(filled_html: str, template_html: str) -> str:
    """Copy library/logo <img> tags from the template when chat output broke them.

    Chat models often rewrite relative or empty logo ``src`` values. For each
    ``<img>`` in the filled HTML at the same index as the template, if the filled
    ``src`` is not a library/data/http URL, restore the template's tag.
    """
    filled = filled_html or ""
    template = template_html or ""
    if not filled or not template:
        return filled

    template_imgs = IMG_TAG_RE.findall(template)
    if not template_imgs:
        return filled

    index = {"i": 0}

    def repl(match: re.Match[str]) -> str:
        i = index["i"]
        index["i"] += 1
        filled_tag = match.group(0)
        if i >= len(template_imgs):
            return filled_tag
        if _is_resolvable_media_src(_img_src(filled_tag)):
            return filled_tag
        return template_imgs[i]

    return IMG_TAG_RE.sub(repl, filled)

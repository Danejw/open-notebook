"""API routes for the global media asset library (template images / logos)."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from loguru import logger

from api.models import MediaAssetResponse, MediaAssetUpdate
from api.routers.sources import generate_unique_filename
from construction_os.config import MEDIA_FOLDER
from construction_os.domain.media_asset import MediaAsset
from construction_os.exceptions import InvalidInputError, NotFoundError

router = APIRouter()

ALLOWED_IMAGE_MIME_TYPES = {
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/webp": {".webp"},
    "image/svg+xml": {".svg"},
    "image/gif": {".gif"},
}

_EXT_TO_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
}

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def media_file_url(asset_id: str) -> str:
    """Stable API path used in template HTML img src attributes."""
    return f"/api/media/{asset_id}/file"


def _media_response(asset: MediaAsset) -> MediaAssetResponse:
    return MediaAssetResponse(
        id=asset.id or "",
        name=asset.name,
        slug=asset.slug,
        mime_type=asset.mime_type,
        byte_size=asset.byte_size,
        created=str(asset.created),
        updated=str(asset.updated),
        file_url=media_file_url(asset.id or ""),
    )


def slugify(value: str) -> str:
    """Derive a URL-safe slug from a display name or filename stem."""
    slug = _SLUG_RE.sub("-", (value or "").strip().lower()).strip("-")
    return slug or "image"


async def unique_slug(base: str, exclude_id: Optional[str] = None) -> str:
    """Return a unique slug, appending -2, -3, ... on collision."""
    candidate = slugify(base)
    if not await MediaAsset.slug_exists(candidate, exclude_id=exclude_id):
        return candidate
    counter = 2
    while await MediaAsset.slug_exists(f"{candidate}-{counter}", exclude_id=exclude_id):
        counter += 1
    return f"{candidate}-{counter}"


def _resolve_mime(upload: UploadFile, filename: str) -> str:
    """Validate and return an allowed image MIME type."""
    ext = Path(filename).suffix.lower()
    content_type = (upload.content_type or "").split(";")[0].strip().lower()

    if content_type in ALLOWED_IMAGE_MIME_TYPES:
        allowed_exts = ALLOWED_IMAGE_MIME_TYPES[content_type]
        if ext and ext not in allowed_exts and ext not in _EXT_TO_MIME:
            raise InvalidInputError(
                f"File extension '{ext}' does not match content type '{content_type}'"
            )
        return content_type

    if ext in _EXT_TO_MIME:
        return _EXT_TO_MIME[ext]

    raise InvalidInputError(
        "Only image uploads are allowed (PNG, JPG, WebP, SVG, GIF)"
    )


def _confine_media_path(file_path: str) -> str:
    """Ensure a media file path stays under MEDIA_FOLDER."""
    safe_root = os.path.realpath(MEDIA_FOLDER)
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(safe_root + os.sep) and resolved != safe_root:
        raise HTTPException(status_code=403, detail="Invalid media file path")
    if not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="Media file not found on disk")
    return resolved


async def _save_media_upload(upload: UploadFile) -> tuple[str, str, int]:
    """Save an image upload under MEDIA_FOLDER; return path, mime, byte size."""
    if not upload.filename:
        raise InvalidInputError("No filename provided")

    mime_type = _resolve_mime(upload, upload.filename)
    file_path = generate_unique_filename(upload.filename, MEDIA_FOLDER)

    try:
        content = await upload.read()
        if not content:
            raise InvalidInputError("Uploaded file is empty")
        with open(file_path, "wb") as f:
            f.write(content)
        logger.info(f"Saved media asset to: {file_path}")
        return file_path, mime_type, len(content)
    except InvalidInputError:
        if os.path.exists(file_path):
            os.unlink(file_path)
        raise
    except Exception as e:
        logger.error(f"Failed to save media upload: {e}")
        if os.path.exists(file_path):
            os.unlink(file_path)
        raise


@router.get("/media", response_model=List[MediaAssetResponse])
async def list_media_assets():
    """List all global media assets."""
    try:
        assets = await MediaAsset.get_all(order_by="name asc")
        return [_media_response(a) for a in assets]
    except Exception as e:
        logger.error(f"Error listing media assets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/media", response_model=MediaAssetResponse)
async def upload_media_asset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    slug: Optional[str] = Form(None),
):
    """Upload an image into the global media library."""
    try:
        file_path, mime_type, byte_size = await _save_media_upload(file)
        display_name = (name or Path(file.filename or "image").stem).strip() or "Image"
        asset_slug = await unique_slug(slug or display_name)

        asset = MediaAsset(
            name=display_name,
            slug=asset_slug,
            file_path=file_path,
            mime_type=mime_type,
            byte_size=byte_size,
        )
        await asset.save()
        return _media_response(asset)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error uploading media asset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/media/by-slug/{slug}", response_model=MediaAssetResponse)
async def get_media_by_slug(slug: str):
    """Look up a media asset by slug (for token resolution)."""
    try:
        asset = await MediaAsset.get_by_slug(slug)
        return _media_response(asset)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching media by slug: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/media/{media_id}", response_model=MediaAssetResponse)
async def get_media_asset(media_id: str):
    """Get media asset metadata by id."""
    try:
        asset = await MediaAsset.get(media_id)
        return _media_response(asset)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching media asset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/media/{media_id}", response_model=MediaAssetResponse)
async def update_media_asset(media_id: str, data: MediaAssetUpdate):
    """Rename a media asset and/or change its slug."""
    try:
        asset = await MediaAsset.get(media_id)
        if data.name is not None:
            name = data.name.strip()
            if not name:
                raise InvalidInputError("name cannot be empty")
            asset.name = name
        if data.slug is not None:
            new_slug = slugify(data.slug)
            if not new_slug:
                raise InvalidInputError("slug cannot be empty")
            if await MediaAsset.slug_exists(new_slug, exclude_id=asset.id):
                raise InvalidInputError(f"Slug '{new_slug}' is already in use")
            asset.slug = new_slug
        await asset.save()
        return _media_response(asset)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating media asset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/media/{media_id}")
async def delete_media_asset(media_id: str):
    """Delete a media asset and its file from disk."""
    try:
        asset = await MediaAsset.get(media_id)
        file_path = asset.file_path
        await asset.delete()
        try:
            resolved = _confine_media_path(file_path)
            os.unlink(resolved)
        except HTTPException:
            logger.warning(f"Media file missing on delete: {file_path}")
        except OSError as e:
            logger.warning(f"Failed to delete media file {file_path}: {e}")
        return {"message": "Media asset deleted"}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting media asset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/media/{media_id}/file")
async def serve_media_file(media_id: str):
    """Serve the raw image file for preview and template embedding."""
    try:
        asset = await MediaAsset.get(media_id)
        resolved = _confine_media_path(asset.file_path)
        return FileResponse(
            path=resolved,
            media_type=asset.mime_type,
            filename=os.path.basename(resolved),
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving media file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

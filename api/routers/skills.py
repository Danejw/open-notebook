"""Skills API routes."""

from __future__ import annotations

from typing import List, Optional
from urllib.parse import unquote

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from loguru import logger

from api import skills_service
from api.skill_models import (
    SkillCatalogItem,
    SkillCreateRequest,
    SkillDetailResponse,
    SkillFileMoveRequest,
    SkillFileUpsertRequest,
    SkillImportConfirmRequest,
    SkillImportPreviewResponse,
    SkillReplaceFilesRequest,
    SkillResponse,
    SkillUpdateRequest,
    ValidationResponse,
)
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.skills.loader import get_skill_catalog, read_skill_file

router = APIRouter()


@router.get("/skills", response_model=List[SkillResponse])
async def list_skills(archived: Optional[bool] = Query(False)):
    try:
        return await skills_service.list_skills(archived=archived)
    except Exception as e:
        logger.error(f"Error listing skills: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skills/catalog", response_model=List[SkillCatalogItem])
async def skills_catalog():
    try:
        items = await get_skill_catalog()
        return [SkillCatalogItem(**i) for i in items]
    except Exception as e:
        logger.error(f"Error loading skill catalog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills", response_model=SkillDetailResponse)
async def create_skill(body: SkillCreateRequest):
    try:
        return await skills_service.create_skill(body)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating skill: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skills/{skill_id}", response_model=SkillDetailResponse)
async def get_skill(skill_id: str):
    try:
        return await skills_service.get_skill(skill_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting skill: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/skills/{skill_id}", response_model=SkillResponse)
async def update_skill(skill_id: str, body: SkillUpdateRequest):
    try:
        return await skills_service.update_skill_metadata(skill_id, body)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating skill: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str):
    try:
        await skills_service.delete_skill(skill_id)
        return {"success": True}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting skill: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/{skill_id}/archive", response_model=SkillResponse)
async def archive_skill(skill_id: str, archived: bool = True):
    try:
        return await skills_service.archive_skill(skill_id, archived=archived)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/skills/{skill_id}/files", response_model=SkillDetailResponse)
async def replace_files(skill_id: str, body: SkillReplaceFilesRequest):
    try:
        return await skills_service.replace_skill_files(skill_id, body.files)
    except (NotFoundError, InvalidInputError) as e:
        status = 404 if isinstance(e, NotFoundError) else 400
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/skills/{skill_id}/file", response_model=SkillDetailResponse)
async def upsert_file(skill_id: str, body: SkillFileUpsertRequest):
    try:
        return await skills_service.upsert_skill_file(
            skill_id,
            body.path,
            body.content,
            encoding=body.encoding,
            mime_type=body.mime_type,
        )
    except (NotFoundError, InvalidInputError) as e:
        status = 404 if isinstance(e, NotFoundError) else 400
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/{skill_id}/files/move", response_model=SkillDetailResponse)
async def move_file(skill_id: str, body: SkillFileMoveRequest):
    try:
        return await skills_service.move_skill_file(
            skill_id, body.from_path, body.to_path
        )
    except (NotFoundError, InvalidInputError) as e:
        status = 404 if isinstance(e, NotFoundError) else 400
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/skills/{skill_id}/file", response_model=SkillDetailResponse)
async def delete_file(skill_id: str, path: str = Query(...)):
    try:
        return await skills_service.delete_skill_file(skill_id, unquote(path))
    except (NotFoundError, InvalidInputError) as e:
        status = 404 if isinstance(e, NotFoundError) else 400
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skills/{skill_id}/file")
async def read_file(skill_id: str, path: str = Query(...)):
    """Tier-3 progressive disclosure: read a file from a skill package."""
    try:
        sf = await read_skill_file(skill_id, unquote(path))
        return {
            "path": sf.path,
            "filename": sf.filename,
            "content": sf.content,
            "encoding": sf.encoding,
            "mime_type": sf.mime_type,
            "size_bytes": sf.size_bytes,
        }
    except (NotFoundError, InvalidInputError) as e:
        status = 404 if isinstance(e, NotFoundError) else 400
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/import/preview", response_model=SkillImportPreviewResponse)
async def import_preview(file: UploadFile = File(...)):
    try:
        data = await file.read()
        return skills_service.preview_import_zip(data)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Import preview failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/import/confirm", response_model=SkillDetailResponse)
async def import_confirm(body: SkillImportConfirmRequest):
    try:
        return await skills_service.confirm_import(body)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/{skill_id}/validate", response_model=ValidationResponse)
async def validate_skill(skill_id: str):
    try:
        return await skills_service.validate_skill(skill_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skills/{skill_id}/export")
async def export_skill(skill_id: str):
    try:
        data, filename = await skills_service.export_skill_zip(skill_id)
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

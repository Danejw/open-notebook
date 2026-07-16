"""Collections API routes."""

from __future__ import annotations

from typing import List, Optional
from urllib.parse import unquote

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from loguru import logger

from api import collections_service
from api.collection_models import (
    CollectionCatalogItem,
    CollectionCreateRequest,
    CollectionDetailResponse,
    CollectionImportConfirmRequest,
    CollectionImportPreviewResponse,
    CollectionReplaceItemsRequest,
    CollectionResponse,
    CollectionUpdateRequest,
    ValidationResponse,
)
from construction_os.collections.loader import get_collection_catalog
from construction_os.exceptions import InvalidInputError, NotFoundError

router = APIRouter()


@router.get("/collections", response_model=List[CollectionResponse])
async def list_collections(archived: Optional[bool] = Query(False)):
    try:
        return await collections_service.list_collections(archived=archived)
    except Exception as e:
        logger.error(f"Error listing collections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collections/catalog", response_model=List[CollectionCatalogItem])
async def collections_catalog():
    try:
        items = await get_collection_catalog()
        return [CollectionCatalogItem(**i) for i in items]
    except Exception as e:
        logger.error(f"Error loading collection catalog: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/collections", response_model=CollectionDetailResponse)
async def create_collection(body: CollectionCreateRequest):
    try:
        return await collections_service.create_collection(body)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collections/{collection_id}", response_model=CollectionDetailResponse)
async def get_collection(collection_id: str):
    try:
        return await collections_service.get_collection(unquote(collection_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/collections/{collection_id}", response_model=CollectionResponse)
async def update_collection(collection_id: str, body: CollectionUpdateRequest):
    try:
        return await collections_service.update_collection(
            unquote(collection_id), body
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/collections/{collection_id}/items",
    response_model=CollectionDetailResponse,
)
async def replace_collection_items(
    collection_id: str,
    body: CollectionReplaceItemsRequest,
):
    try:
        return await collections_service.replace_collection_items(
            unquote(collection_id), body
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error replacing collection items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/collections/{collection_id}/duplicate",
    response_model=CollectionDetailResponse,
)
async def duplicate_collection(collection_id: str):
    try:
        return await collections_service.duplicate_collection(unquote(collection_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error duplicating collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/collections/{collection_id}/archive",
    response_model=CollectionResponse,
)
async def archive_collection(collection_id: str):
    try:
        return await collections_service.archive_collection(unquote(collection_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error archiving collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str):
    try:
        await collections_service.delete_collection(unquote(collection_id))
        return {"message": "Collection deleted"}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/collections/{collection_id}/validate",
    response_model=ValidationResponse,
)
async def validate_collection(collection_id: str):
    try:
        return await collections_service.validate_collection(unquote(collection_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error validating collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/collections/import/preview",
    response_model=CollectionImportPreviewResponse,
)
async def import_preview(file: UploadFile = File(...)):
    try:
        data = await file.read()
        return await collections_service.import_preview_zip(
            data, source_filename=file.filename
        )
    except Exception as e:
        logger.error(f"Error previewing collection import: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/collections/import/confirm",
    response_model=CollectionDetailResponse,
)
async def import_confirm(body: CollectionImportConfirmRequest):
    try:
        return await collections_service.import_confirm(body)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error confirming collection import: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collections/{collection_id}/export")
async def export_collection(collection_id: str):
    try:
        data = await collections_service.export_collection_zip(unquote(collection_id))
        collection = await collections_service.get_collection(unquote(collection_id))
        filename = f"{collection.slug}.zip"
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error exporting collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

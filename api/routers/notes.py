"""Deprecated /notes routes — thin aliases to project-artifacts handlers."""

from typing import List, Optional

from fastapi import APIRouter, Query

from api.models import (
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    PromoteToSourceRequest,
    SourceResponse,
)
from api.routers import project_artifacts as pa

router = APIRouter()


@router.get("/notes", response_model=List[NoteResponse], deprecated=True)
async def get_notes(
    project_id: Optional[str] = Query(None, description="Filter by Project ID"),
):
    """Deprecated: use GET /project-artifacts."""
    return await pa.list_project_artifacts(project_id=project_id)


@router.post("/notes", response_model=NoteResponse, deprecated=True)
async def create_note(note_data: NoteCreate):
    """Deprecated: use POST /project-artifacts."""
    return await pa.create_project_artifact_endpoint(note_data)


@router.get("/notes/{note_id}", response_model=NoteResponse, deprecated=True)
async def get_note(note_id: str):
    """Deprecated: use GET /project-artifacts/{id}."""
    return await pa.get_project_artifact(note_id)


@router.put("/notes/{note_id}", response_model=NoteResponse, deprecated=True)
async def update_note(note_id: str, note_update: NoteUpdate):
    """Deprecated: use PUT /project-artifacts/{id}."""
    return await pa.update_project_artifact(note_id, note_update)


@router.post(
    "/notes/{note_id}/ingest-as-source",
    response_model=SourceResponse,
    deprecated=True,
)
async def ingest_note_as_source(note_id: str, request: PromoteToSourceRequest):
    """Deprecated: use POST /project-artifacts/{id}/ingest-as-source."""
    return await pa.ingest_project_artifact_as_source(note_id, request)


@router.get("/notes/{note_id}/export/pdf", deprecated=True)
async def export_note_pdf(note_id: str):
    """Deprecated: use GET /project-artifacts/{id}/export/pdf."""
    return await pa.export_project_artifact_pdf(note_id)


@router.delete("/notes/{note_id}", deprecated=True)
async def delete_note(note_id: str):
    """Deprecated: use DELETE /project-artifacts/{id}."""
    return await pa.delete_project_artifact(note_id)

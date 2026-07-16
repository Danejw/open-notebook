"""Deprecated /artifacts routes — thin aliases to artifact-templates handlers."""

from typing import List

from fastapi import APIRouter

from api.models import (
    ArtifactCreate,
    ArtifactExecuteRequest,
    ArtifactExecuteResponse,
    ArtifactResponse,
    ArtifactUpdate,
    DefaultPromptResponse,
    DefaultPromptUpdate,
)
from api.routers import artifact_templates as at

router = APIRouter()


@router.get("/artifacts", response_model=List[ArtifactResponse], deprecated=True)
async def get_artifacts():
    """Deprecated: use GET /artifact-templates."""
    return await at.list_artifact_templates()


@router.post("/artifacts", response_model=ArtifactResponse, deprecated=True)
async def create_artifact(artifact_data: ArtifactCreate):
    """Deprecated: use POST /artifact-templates."""
    return await at.create_artifact_template(artifact_data)


@router.post("/artifacts/execute", response_model=ArtifactExecuteResponse, deprecated=True)
async def execute_artifact(execute_request: ArtifactExecuteRequest):
    """Deprecated: use POST /artifact-templates/execute."""
    return await at.execute_artifact_template_endpoint(execute_request)


@router.get(
    "/artifacts/default-prompt", response_model=DefaultPromptResponse, deprecated=True
)
async def get_default_prompt():
    """Deprecated: use GET /artifact-templates/default-prompt."""
    return await at.get_default_prompt()


@router.put(
    "/artifacts/default-prompt", response_model=DefaultPromptResponse, deprecated=True
)
async def update_default_prompt(prompt_update: DefaultPromptUpdate):
    """Deprecated: use PUT /artifact-templates/default-prompt."""
    return await at.update_default_prompt(prompt_update)


@router.get(
    "/artifacts/{artifact_id}", response_model=ArtifactResponse, deprecated=True
)
async def get_artifact(artifact_id: str):
    """Deprecated: use GET /artifact-templates/{id}."""
    return await at.get_artifact_template(artifact_id)


@router.put(
    "/artifacts/{artifact_id}", response_model=ArtifactResponse, deprecated=True
)
async def update_artifact(artifact_id: str, artifact_update: ArtifactUpdate):
    """Deprecated: use PUT /artifact-templates/{id}."""
    return await at.update_artifact_template(artifact_id, artifact_update)


@router.delete("/artifacts/{artifact_id}", deprecated=True)
async def delete_artifact(artifact_id: str):
    """Deprecated: use DELETE /artifact-templates/{id}."""
    return await at.delete_artifact_template(artifact_id)

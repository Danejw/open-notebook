from typing import List

from fastapi import APIRouter, HTTPException
from loguru import logger

from api.models import (
    ArtifactCreate,
    ArtifactExecuteRequest,
    ArtifactExecuteResponse,
    ArtifactResponse,
    ArtifactUpdate,
    DefaultPromptResponse,
    DefaultPromptUpdate,
)
from construction_os.domain.artifact import ArtifactTemplate, DefaultPrompts
from construction_os.exceptions import ConstructionOSError, InvalidInputError, NotFoundError
from construction_os.services.artifact_templates import (
    artifact_template_to_dict,
    execute_artifact_template,
)

router = APIRouter()


def _artifact_template_response(
    artifact_template: ArtifactTemplate,
) -> ArtifactResponse:
    """Map a domain ArtifactTemplate to the API response schema."""
    data = artifact_template_to_dict(artifact_template, include_prompt=True)
    return ArtifactResponse(**data)


@router.get("/artifact-templates", response_model=List[ArtifactResponse])
async def list_artifact_templates():
    """Get all artifact templates."""
    try:
        templates = await ArtifactTemplate.get_all(order_by="name asc")
        return [_artifact_template_response(template) for template in templates]
    except Exception as e:
        logger.error(f"Error fetching artifact templates: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching artifact templates: {str(e)}"
        )


@router.post("/artifact-templates", response_model=ArtifactResponse)
async def create_artifact_template(artifact_data: ArtifactCreate):
    """Create a new artifact template."""
    try:
        new_template = ArtifactTemplate(
            name=artifact_data.name,
            title=artifact_data.title,
            description=artifact_data.description,
            prompt=artifact_data.prompt,
            apply_default=artifact_data.apply_default,
            lifecycle_phase=artifact_data.lifecycle_phase,
            skill_ids=artifact_data.skill_ids,
            collection_ids=artifact_data.collection_ids,
            mcp_tool_ids=artifact_data.mcp_tool_ids,
            html_template_id=artifact_data.html_template_id,
        )
        await new_template.save()
        return _artifact_template_response(new_template)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating artifact template: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating artifact template: {str(e)}"
        )


@router.post("/artifact-templates/execute", response_model=ArtifactExecuteResponse)
async def execute_artifact_template_endpoint(execute_request: ArtifactExecuteRequest):
    """Execute an artifact template on input text."""
    try:
        result = await execute_artifact_template(
            artifact_id=execute_request.artifact_id,
            input_text=execute_request.input_text,
            model_id=execute_request.model_id,
        )
        return ArtifactExecuteResponse(
            output=result["output"],
            artifact_id=execute_request.artifact_id,
            model_id=execute_request.model_id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except HTTPException:
        raise
    except ConstructionOSError:
        raise
    except Exception as e:
        logger.error(f"Error executing artifact template: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error executing artifact template: {str(e)}"
        )


@router.get("/artifact-templates/default-prompt", response_model=DefaultPromptResponse)
async def get_default_prompt():
    """Get the default artifact template prompt."""
    try:
        default_prompts: DefaultPrompts = await DefaultPrompts.get_instance()  # type: ignore[assignment]

        return DefaultPromptResponse(
            artifact_instructions=default_prompts.artifact_instructions or ""
        )
    except Exception as e:
        logger.error(f"Error fetching default prompt: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching default prompt: {str(e)}"
        )


@router.put("/artifact-templates/default-prompt", response_model=DefaultPromptResponse)
async def update_default_prompt(prompt_update: DefaultPromptUpdate):
    """Update the default artifact template prompt."""
    try:
        default_prompts: DefaultPrompts = await DefaultPrompts.get_instance()  # type: ignore[assignment]

        default_prompts.artifact_instructions = prompt_update.artifact_instructions
        await default_prompts.update()

        return DefaultPromptResponse(
            artifact_instructions=default_prompts.artifact_instructions
        )
    except Exception as e:
        logger.error(f"Error updating default prompt: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating default prompt: {str(e)}"
        )


@router.get("/artifact-templates/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact_template(artifact_id: str):
    """Get a specific artifact template by ID."""
    try:
        artifact_template = await ArtifactTemplate.get(artifact_id)
        if not artifact_template:
            raise HTTPException(status_code=404, detail="Artifact template not found")

        return _artifact_template_response(artifact_template)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching artifact template {artifact_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching artifact template: {str(e)}"
        )


@router.put("/artifact-templates/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact_template(
    artifact_id: str, artifact_update: ArtifactUpdate
):
    """Update an artifact template."""
    try:
        artifact_template = await ArtifactTemplate.get(artifact_id)
        if not artifact_template:
            raise HTTPException(status_code=404, detail="Artifact template not found")

        if artifact_update.name is not None:
            artifact_template.name = artifact_update.name
        if artifact_update.title is not None:
            artifact_template.title = artifact_update.title
        if artifact_update.description is not None:
            artifact_template.description = artifact_update.description
        if artifact_update.prompt is not None:
            artifact_template.prompt = artifact_update.prompt
        if artifact_update.apply_default is not None:
            artifact_template.apply_default = artifact_update.apply_default
        if artifact_update.lifecycle_phase is not None:
            artifact_template.lifecycle_phase = artifact_update.lifecycle_phase
        if artifact_update.skill_ids is not None:
            artifact_template.skill_ids = artifact_update.skill_ids
        if artifact_update.collection_ids is not None:
            artifact_template.collection_ids = artifact_update.collection_ids
        if artifact_update.mcp_tool_ids is not None:
            artifact_template.mcp_tool_ids = artifact_update.mcp_tool_ids
        if "html_template_id" in artifact_update.model_fields_set:
            artifact_template.html_template_id = artifact_update.html_template_id

        await artifact_template.save()
        return _artifact_template_response(artifact_template)
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating artifact template {artifact_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating artifact template: {str(e)}"
        )


@router.delete("/artifact-templates/{artifact_id}")
async def delete_artifact_template(artifact_id: str):
    """Delete an artifact template."""
    try:
        artifact_template = await ArtifactTemplate.get(artifact_id)
        if not artifact_template:
            raise HTTPException(status_code=404, detail="Artifact template not found")

        await artifact_template.delete()

        return {"message": "Artifact template deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting artifact template {artifact_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting artifact template: {str(e)}"
        )

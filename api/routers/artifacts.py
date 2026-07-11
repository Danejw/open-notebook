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
from construction_os.ai.models import Model
from construction_os.domain.artifact import Artifact, DefaultPrompts
from construction_os.exceptions import ConstructionOSError, InvalidInputError
from construction_os.graphs.artifact import graph as artifact_graph

router = APIRouter()


@router.get("/artifacts", response_model=List[ArtifactResponse])
async def get_artifacts():
    """Get all artifacts."""
    try:
        artifacts = await Artifact.get_all(order_by="name asc")

        return [
            ArtifactResponse(
                id=artifact.id or "",
                name=artifact.name,
                title=artifact.title,
                description=artifact.description,
                prompt=artifact.prompt,
                apply_default=artifact.apply_default,
                created=str(artifact.created),
                updated=str(artifact.updated),
            )
            for artifact in artifacts
        ]
    except Exception as e:
        logger.error(f"Error fetching artifacts: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching artifacts: {str(e)}"
        )


@router.post("/artifacts", response_model=ArtifactResponse)
async def create_artifact(artifact_data: ArtifactCreate):
    """Create a new artifact."""
    try:
        new_artifact = Artifact(
            name=artifact_data.name,
            title=artifact_data.title,
            description=artifact_data.description,
            prompt=artifact_data.prompt,
            apply_default=artifact_data.apply_default,
        )
        await new_artifact.save()

        return ArtifactResponse(
            id=new_artifact.id or "",
            name=new_artifact.name,
            title=new_artifact.title,
            description=new_artifact.description,
            prompt=new_artifact.prompt,
            apply_default=new_artifact.apply_default,
            created=str(new_artifact.created),
            updated=str(new_artifact.updated),
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating artifact: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating artifact: {str(e)}"
        )


@router.post("/artifacts/execute", response_model=ArtifactExecuteResponse)
async def execute_artifact(execute_request: ArtifactExecuteRequest):
    """Execute an artifact on input text."""
    try:
        artifact = await Artifact.get(execute_request.artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        model = await Model.get(execute_request.model_id)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")

        result = await artifact_graph.ainvoke(
            dict(  # type: ignore[arg-type]
                input_text=execute_request.input_text,
                artifact=artifact,
            ),
            config=dict(configurable={"model_id": execute_request.model_id}),
        )

        return ArtifactExecuteResponse(
            output=result["output"],
            artifact_id=execute_request.artifact_id,
            model_id=execute_request.model_id,
        )

    except HTTPException:
        raise
    except ConstructionOSError:
        raise
    except Exception as e:
        logger.error(f"Error executing artifact: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error executing artifact: {str(e)}"
        )


@router.get("/artifacts/default-prompt", response_model=DefaultPromptResponse)
async def get_default_prompt():
    """Get the default artifact prompt."""
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


@router.put("/artifacts/default-prompt", response_model=DefaultPromptResponse)
async def update_default_prompt(prompt_update: DefaultPromptUpdate):
    """Update the default artifact prompt."""
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


@router.get("/artifacts/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(artifact_id: str):
    """Get a specific artifact by ID."""
    try:
        artifact = await Artifact.get(artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        return ArtifactResponse(
            id=artifact.id or "",
            name=artifact.name,
            title=artifact.title,
            description=artifact.description,
            prompt=artifact.prompt,
            apply_default=artifact.apply_default,
            created=str(artifact.created),
            updated=str(artifact.updated),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching artifact {artifact_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching artifact: {str(e)}"
        )


@router.put("/artifacts/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact(artifact_id: str, artifact_update: ArtifactUpdate):
    """Update an artifact."""
    try:
        artifact = await Artifact.get(artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        if artifact_update.name is not None:
            artifact.name = artifact_update.name
        if artifact_update.title is not None:
            artifact.title = artifact_update.title
        if artifact_update.description is not None:
            artifact.description = artifact_update.description
        if artifact_update.prompt is not None:
            artifact.prompt = artifact_update.prompt
        if artifact_update.apply_default is not None:
            artifact.apply_default = artifact_update.apply_default

        await artifact.save()

        return ArtifactResponse(
            id=artifact.id or "",
            name=artifact.name,
            title=artifact.title,
            description=artifact.description,
            prompt=artifact.prompt,
            apply_default=artifact.apply_default,
            created=str(artifact.created),
            updated=str(artifact.updated),
        )
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating artifact {artifact_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating artifact: {str(e)}"
        )


@router.delete("/artifacts/{artifact_id}")
async def delete_artifact(artifact_id: str):
    """Delete an artifact."""
    try:
        artifact = await Artifact.get(artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")

        await artifact.delete()

        return {"message": "Artifact deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting artifact {artifact_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting artifact: {str(e)}"
        )

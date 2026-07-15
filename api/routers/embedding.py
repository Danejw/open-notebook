from fastapi import APIRouter, HTTPException
from loguru import logger

from api.models import EmbedRequest, EmbedResponse
from construction_os.ai.models import model_manager
from construction_os.domain.project import Note, Source
from construction_os.exceptions import NotFoundError
from construction_os.knowledge.pipeline import sanitize_processing_error

router = APIRouter()


@router.post("/embed", response_model=EmbedResponse)
async def embed_content(embed_request: EmbedRequest):
    """Embed content for vector search."""
    try:
        # Check if embedding model is available
        if not await model_manager.get_embedding_model():
            raise HTTPException(
                status_code=400,
                detail="No embedding model configured. Please configure one in the Models section.",
            )

        item_id = embed_request.item_id
        item_type = embed_request.item_type.lower()

        # Validate item type
        if item_type not in ["source", "note"]:
            raise HTTPException(
                status_code=400, detail="Item type must be either 'source' or 'note'"
            )

        command_id = None

        if item_type == "source":
            # Domain path updates embed_command + pipeline_stage via begin_embed_stage
            source_item = await Source.get(item_id)
            command_id = await source_item.vectorize(chain_kg=embed_request.chain_kg)
            message = (
                "Source embedding job submitted"
                if embed_request.chain_kg
                else "Source embedding job submitted (without knowledge graph)"
            )
        else:
            note_item = await Note.get(item_id)
            # Note.save() internally submits embed_note command and returns command_id
            command_id = await note_item.save()
            message = "Note embedding job submitted"

        return EmbedResponse(
            success=True,
            message=message,
            item_id=item_id,
            item_type=item_type,
            command_id=command_id,
        )

    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(
            status_code=404, detail=f"{embed_request.item_type} not found"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=sanitize_processing_error(e)
        )
    except Exception as e:
        logger.error(
            f"Error embedding {embed_request.item_type} {embed_request.item_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500,
            detail=f"Error embedding content: {sanitize_processing_error(e)}",
        )

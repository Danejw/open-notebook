from fastapi import APIRouter, HTTPException
from loguru import logger

from api.models import ContextRequest, ContextResponse
from construction_os.domain.project import Note, Project, Source
from construction_os.exceptions import InvalidInputError
from construction_os.utils import token_count
from construction_os.utils.context_mode import (
    is_note_included,
    is_source_included,
    normalize_inclusion_status,
)

router = APIRouter()

# Deprecated: the frontend uses POST /chat/context for context preview.
# This route remains registered for external API consumers until 2026-12-31;
# prefer POST /chat/context for new integrations.
DEPRECATED_CONTEXT_SUNSET = "2026-12-31"


@router.post(
    "/projects/{project_id}/context",
    response_model=ContextResponse,
    deprecated=True,
    summary="Full project context dump (deprecated)",
    description=(
        "Deprecated — sunset **2026-12-31**. The Next.js UI uses "
        "`POST /chat/context` for token-preview estimates. This route dumps "
        "configured sources/notes without retrieval ranking for legacy API clients."
    ),
)
async def get_project_context(project_id: str, context_request: ContextRequest):
    """Full project context dump for API clients and legacy integrations.

    The Next.js project chat UI uses ``POST /chat/context`` for token-preview
    estimates and passes ``context_config`` on execute for runtime retrieval
    (``build_relevance_context``). This route dumps configured sources/notes
    without retrieval ranking; keep it until external usage is confirmed zero.

    .. deprecated::
        Prefer ``POST /chat/context`` for new integrations.
    """
    try:
        # Verify Project exists
        project = await Project.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        context_data: dict[str, list[dict[str, str]]] = {"note": [], "source": []}
        total_content = ""

        # Process context configuration if provided
        if context_request.context_config:
            # Process sources
            for source_id, status in context_request.context_config.sources.items():
                if not is_source_included(status):
                    continue
                status = normalize_inclusion_status(status)

                try:
                    # Add table prefix if not present
                    full_source_id = (
                        source_id
                        if source_id.startswith("source:")
                        else f"source:{source_id}"
                    )

                    try:
                        source = await Source.get(full_source_id)
                    except Exception:
                        continue

                    source_context = await source.get_context(context_size="long")
                    context_data["source"].append(source_context)
                    total_content += str(source_context)
                except Exception as e:
                    logger.warning(f"Error processing source {source_id}: {str(e)}")
                    continue

            # Process project artifacts (canonical artifacts + legacy notes maps)
            for note_id, status in context_request.context_config.resolved_artifacts().items():
                if not is_note_included(status):
                    continue
                status = normalize_inclusion_status(status)

                try:
                    # Add table prefix if not present
                    full_note_id = (
                        note_id if note_id.startswith("note:") else f"note:{note_id}"
                    )
                    note = await Note.get(full_note_id)
                    if not note:
                        continue

                    note_context = note.get_context(context_size="long")
                    context_data["note"].append(note_context)
                    total_content += str(note_context)
                except Exception as e:
                    logger.warning(f"Error processing artifact {note_id}: {str(e)}")
                    continue
        else:
            # Default behavior - include all sources and notes with short context
            sources = await project.get_sources()
            for source in sources:
                try:
                    source_context = await source.get_context(context_size="short")
                    context_data["source"].append(source_context)
                    total_content += str(source_context)
                except Exception as e:
                    logger.warning(f"Error processing source {source.id}: {str(e)}")
                    continue

            notes = await project.get_notes()
            for note in notes:
                try:
                    note_context = note.get_context(context_size="short")
                    context_data["note"].append(note_context)
                    total_content += str(note_context)
                except Exception as e:
                    logger.warning(f"Error processing note {note.id}: {str(e)}")
                    continue

        # Calculate estimated token count
        estimated_tokens = token_count(total_content) if total_content else 0

        return ContextResponse(
            project_id=project_id,
            sources=context_data["source"],
            notes=context_data["note"],
            total_tokens=estimated_tokens,
        )

    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting context for Project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting context: {str(e)}")

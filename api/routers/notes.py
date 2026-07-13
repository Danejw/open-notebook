from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from api.models import (
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    PromoteToSourceRequest,
    SourceResponse,
)
from construction_os.domain.project import Note
from construction_os.exceptions import InvalidInputError, NotFoundError

router = APIRouter()

_AUTO_TITLE_NOTE_TYPES = ("ai", "artifact")


async def _generate_note_title(content: str, note_type: str) -> str:
    from construction_os.graphs.prompt import graph as prompt_graph

    if note_type == "artifact":
        prompt = (
            "Based on the artifact content below, provide a concise descriptive title "
            "(max 15 words) for a construction project artifact."
        )
    else:
        prompt = (
            "Based on the Note below, please provide a Title for this content, "
            "with max 15 words"
        )

    result = await prompt_graph.ainvoke(
        {  # type: ignore[arg-type]
            "input_text": content,
            "prompt": prompt,
        }
    )
    return result.get("output", "Untitled Note")


@router.get("/notes", response_model=List[NoteResponse])
async def get_notes(
    project_id: Optional[str] = Query(None, description="Filter by Project ID"),
):
    """Get all notes with optional Project filtering."""
    try:
        if project_id:
            # Get notes for a specific Project
            from construction_os.domain.project import Project

            project = await Project.get(project_id)
            notes = await project.get_notes()
        else:
            # Get all notes
            notes = await Note.get_all(order_by="updated desc")

        return [
            NoteResponse(
                id=note.id or "",
                title=note.title,
                content=note.content,
                note_type=note.note_type,
                created=str(note.created),
                updated=str(note.updated),
            )
            for note in notes
        ]
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        logger.error(f"Error fetching notes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching notes: {str(e)}")


@router.post("/notes", response_model=NoteResponse)
async def create_note(note_data: NoteCreate):
    """Create a new note."""
    try:
        title = note_data.title
        if (
            not title
            and note_data.note_type in _AUTO_TITLE_NOTE_TYPES
            and note_data.content
        ):
            title = await _generate_note_title(note_data.content, note_data.note_type)

        # Validate note_type
        note_type: Optional[Literal["human", "ai", "note", "artifact"]] = None
        if note_data.note_type in ("human", "ai", "note", "artifact"):
            note_type = note_data.note_type  # type: ignore[assignment]
        elif note_data.note_type is not None:
            raise HTTPException(
                status_code=400, detail="note_type must be 'human', 'ai', 'note', or 'artifact'"
            )

        new_note = Note(
            title=title,
            content=note_data.content,
            note_type=note_type,
        )
        command_id = await new_note.save()

        # Add to Project if specified
        if note_data.project_id:
            from construction_os.domain.project import Project

            # Verify the Project exists (raises NotFoundError -> 404)
            await Project.get(note_data.project_id)
            await new_note.add_to_project(note_data.project_id)

        return NoteResponse(
            id=new_note.id or "",
            title=new_note.title,
            content=new_note.content,
            note_type=new_note.note_type,
            created=str(new_note.created),
            updated=str(new_note.updated),
            command_id=str(command_id) if command_id else None,
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating note: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating note: {str(e)}")


@router.get("/notes/{note_id}", response_model=NoteResponse)
async def get_note(note_id: str):
    """Get a specific note by ID."""
    try:
        note = await Note.get(note_id)

        return NoteResponse(
            id=note.id or "",
            title=note.title,
            content=note.content,
            note_type=note.note_type,
            created=str(note.created),
            updated=str(note.updated),
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Note not found")
    except Exception as e:
        logger.error(f"Error fetching note {note_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching note: {str(e)}")


@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note(note_id: str, note_update: NoteUpdate):
    """Update a note."""
    try:
        note = await Note.get(note_id)

        # Update only provided fields
        if note_update.title is not None:
            note.title = note_update.title
        if note_update.content is not None:
            note.content = note_update.content
        if note_update.note_type is not None:
            if note_update.note_type in ("human", "ai", "note", "artifact"):
                note.note_type = note_update.note_type  # type: ignore[assignment]
            else:
                raise HTTPException(
                    status_code=400, detail="note_type must be 'human', 'ai', 'note', or 'artifact'"
                )

        command_id = await note.save()

        return NoteResponse(
            id=note.id or "",
            title=note.title,
            content=note.content,
            note_type=note.note_type,
            created=str(note.created),
            updated=str(note.updated),
            command_id=str(command_id) if command_id else None,
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Note not found")
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating note {note_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating note: {str(e)}")


@router.post("/notes/{note_id}/ingest-as-source", response_model=SourceResponse)
async def ingest_note_as_source(note_id: str, request: PromoteToSourceRequest):
    """Promote a note (artifact or AI) into a fully ingested text source."""
    from api.promotion_service import promote_note_to_source

    try:
        return await promote_note_to_source(
            note_id,
            project_id=request.project_id,
            embed=request.embed,
            artifact_ids=request.artifacts or [],
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error ingesting note {note_id} as source: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error ingesting note as source: {e}"
        )


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    """Delete a note."""
    try:
        note = await Note.get(note_id)

        await note.delete()

        return {"message": "Note deleted successfully"}
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Note not found")
    except Exception as e:
        logger.error(f"Error deleting note {note_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting note: {str(e)}")

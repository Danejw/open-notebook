"""Promote notes and raw text into ingested text sources."""

from typing import List, Optional

from loguru import logger

from api.command_service import CommandService
from api.models import SourceResponse
from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.project import Note, Project, Source
from construction_os.exceptions import InvalidInputError, NotFoundError


async def get_note_project_ids(note_id: str) -> List[str]:
    """Return project IDs linked to a note via project_note edges."""
    result = await repo_query(
        "SELECT out FROM project_note WHERE in = $note_id",
        {"note_id": ensure_record_id(note_id)},
    )
    return [str(row["out"]) for row in result if row.get("out")]


async def get_source_project_ids(source_id: str) -> List[str]:
    """Return project IDs linked to a source via reference edges."""
    result = await repo_query(
        "SELECT out FROM reference WHERE in = $source_id",
        {"source_id": ensure_record_id(source_id)},
    )
    return [str(row["out"]) for row in result if row.get("out")]


async def _validate_projects(project_ids: List[str]) -> None:
    for project_id in project_ids:
        project = await Project.get(project_id)
        if not project:
            raise NotFoundError(f"Project {project_id} not found")


async def promote_text_to_source(
    *,
    content: str,
    title: str,
    project_ids: List[str],
    embed: bool = True,
    artifact_ids: Optional[List[str]] = None,
) -> SourceResponse:
    """Create a source shell and queue ingest_text_source for background processing."""
    stripped = (content or "").strip()
    if not stripped:
        raise InvalidInputError("Content is required for ingestion")

    if not project_ids:
        raise InvalidInputError("At least one project ID is required")

    # artifact_ids accepted for API compatibility but ignored (insights removed)
    await _validate_projects(project_ids)

    source = Source(
        title=title or "Untitled",
        topics=[],
    )
    await source.save()

    for project_id in project_ids:
        await source.add_to_project(project_id)

    try:
        import commands.source_commands  # noqa: F401

        command_id = await CommandService.submit_command_job(
            "construction_os",
            "ingest_text_source",
            {
                "source_id": str(source.id),
                "content": stripped,
                "title": title or "Untitled",
                "project_ids": project_ids,
                "artifacts": [],
                "embed": embed,
            },
        )

        source.command = ensure_record_id(command_id)
        await source.save()

        return SourceResponse(
            id=source.id or "",
            title=source.title,
            topics=source.topics or [],
            asset=None,
            full_text=None,
            embedded=False,
            embedded_chunks=0,
            created=str(source.created),
            updated=str(source.updated),
            command_id=command_id,
            status="new",
            processing_info={"async": True, "queued": True, "promotion": True},
            projects=project_ids,
        )
    except Exception as e:
        logger.error(f"Failed to queue text source ingestion: {e}")
        try:
            await source.delete()
        except Exception:
            pass
        raise


async def promote_note_to_source(
    note_id: str,
    *,
    project_id: Optional[str] = None,
    embed: bool = True,
    artifact_ids: Optional[List[str]] = None,
) -> SourceResponse:
    note = await Note.get(note_id)
    if not note:
        raise NotFoundError("Note not found")

    if note.note_type not in ("artifact", "ai"):
        raise InvalidInputError(
            "Only artifact or AI notes can be ingested as sources"
        )

    content = note.content or ""
    if not content.strip():
        raise InvalidInputError("Note has no content to ingest")

    project_ids: List[str] = []
    if project_id:
        project_ids = [project_id]
    else:
        project_ids = await get_note_project_ids(note_id)

    if not project_ids:
        raise InvalidInputError(
            "project_id is required when the note is not linked to a project"
        )

    title = note.title or "Untitled artifact"
    return await promote_text_to_source(
        content=content,
        title=title,
        project_ids=project_ids,
        embed=embed,
        artifact_ids=artifact_ids,
    )

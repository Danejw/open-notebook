"""Create project-linked upload sources and queue extract/embed processing."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from loguru import logger

from api.command_service import CommandService
from commands.source_commands import SourceProcessingInput
from construction_os.config import UPLOADS_FOLDER
from construction_os.database.repository import ensure_record_id
from construction_os.domain.project import Asset, Source
from construction_os.knowledge.pipeline import PIPELINE_EXTRACTING


async def create_upload_source_and_process(
    *,
    file_path: str,
    project_id: str,
    title: Optional[str] = None,
    embed: bool = True,
) -> Source:
    """Persist an upload Source under a project and submit ``process_source``.

    Mirrors the async upload path used by ``POST /sources`` without an HTTP
    self-call so Opportunity Pursue can reuse the normal pipeline.
    """

    uploads_resolved = Path(UPLOADS_FOLDER).resolve()
    file_resolved = Path(file_path).resolve()
    if not str(file_resolved).startswith(str(uploads_resolved) + os.sep):
        raise ValueError("Invalid file path: must be within the uploads directory")

    source = Source(
        title=title or file_resolved.name or "Processing...",
        topics=[],
        asset=Asset(file_path=str(file_resolved)),
        pipeline_stage=PIPELINE_EXTRACTING,
    )
    await source.save()
    await source.add_to_project(project_id)

    import commands.source_commands  # noqa: F401

    command_input = SourceProcessingInput(
        source_id=str(source.id),
        content_state={
            "file_path": str(file_resolved),
            "delete_source": False,
        },
        project_ids=[project_id],
        artifacts=[],
        embed=embed,
    )
    command_id = await CommandService.submit_command_job(
        "construction_os",
        "process_source",
        command_input.model_dump(),
    )
    source.command = ensure_record_id(command_id)
    await source.save()
    logger.info(
        "Queued process_source for opportunity upload source {} (command {})",
        source.id,
        command_id,
    )
    return source

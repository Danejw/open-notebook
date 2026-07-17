"""Surreal-commands handler for architectural drawing extraction."""

import time
from typing import Any, Dict, Optional

from loguru import logger
from pydantic import Field
from surreal_commands import CommandInput, CommandOutput, command

from construction_os.drawing.pipeline import run_drawing_extraction


class DrawingExtractionInput(CommandInput):
    """Validated args for one drawing extraction job.

    Do not use ``from __future__ import annotations`` in this module.
    surreal-commands wraps the input schema in a RootModel that must see
    real class objects at decoration time, not postponed string annotations.
    """

    source_id: str = Field(..., description="Source record ID")
    project_id: Optional[str] = Field(None, description="Optional project scope")
    run_id: Optional[str] = Field(None, description="Pre-created extraction run ID")
    force: bool = Field(False, description="Force rerun even if file hash matches")
    publish: bool = Field(
        True,
        description="Publish semantic embeddings and KG after extraction",
    )


class DrawingExtractionOutput(CommandOutput):
    success: bool
    run_id: Optional[str] = None
    status: Optional[str] = None
    skipped: bool = False
    stats: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    processing_time: float = 0.0


@command(
    "extract_architectural_drawings",
    app="construction_os",
    retry={
        "max_attempts": 3,
        "wait_strategy": "exponential_jitter",
        "stop_on": [ValueError, FileNotFoundError],
    },
)
async def extract_architectural_drawings_command(
    input_data: DrawingExtractionInput,
) -> DrawingExtractionOutput:
    """Opt-in architectural drawing extraction — isolated from source ingestion."""
    start = time.time()
    logger.info(
        "Starting architectural drawing extraction for source {}",
        input_data.source_id,
    )
    try:
        result = await run_drawing_extraction(
            source_id=input_data.source_id,
            project_id=input_data.project_id,
            force=input_data.force,
            run_id=input_data.run_id,
            publish=input_data.publish,
        )
        return DrawingExtractionOutput(
            success=bool(result.get("success")),
            run_id=result.get("run_id"),
            status=result.get("status"),
            skipped=bool(result.get("skipped")),
            stats=result.get("stats") or {},
            error_message=result.get("error"),
            processing_time=time.time() - start,
        )
    except (ValueError, FileNotFoundError) as exc:
        logger.error("Drawing extraction permanent failure: {}", exc)
        raise
    except Exception as exc:
        logger.error("Drawing extraction transient failure: {}", exc)
        raise

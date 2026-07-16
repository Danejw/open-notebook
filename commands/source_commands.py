import time
from typing import Any, Dict, List, Optional

from loguru import logger
from pydantic import BaseModel
from surreal_commands import CommandInput, CommandOutput, command

from construction_os.database.repository import ensure_record_id
from construction_os.domain.project import Source
from construction_os.exceptions import ConfigurationError
from construction_os.knowledge.pipeline import (
    PIPELINE_EXTRACTING,
    set_pipeline_stage,
)

try:
    from construction_os.graphs.source import source_graph
except ImportError as e:
    logger.error(f"Failed to import graphs: {e}")
    raise ValueError("graphs not available")


def full_model_dump(model):
    if isinstance(model, BaseModel):
        return model.model_dump()
    elif isinstance(model, dict):
        return {k: full_model_dump(v) for k, v in model.items()}
    elif isinstance(model, list):
        return [full_model_dump(item) for item in model]
    else:
        return model


class SourceProcessingInput(CommandInput):
    source_id: str
    content_state: Dict[str, Any]
    project_ids: List[str]
    # Accepted for API compatibility; ignored — insights feature removed
    artifacts: List[str] = []
    embed: bool


class SourceProcessingOutput(CommandOutput):
    success: bool
    source_id: str
    embedded_chunks: int = 0
    processing_time: float
    error_message: Optional[str] = None


@command(
    "process_source",
    app="construction_os",
    retry={
        "max_attempts": 15,  # Handle deep queues (workaround for SurrealDB v2 transaction conflicts)
        "wait_strategy": "exponential_jitter",
        "wait_min": 1,
        "wait_max": 120,  # Allow queue to drain
        "stop_on": [ValueError, ConfigurationError],  # Don't retry validation/config errors
        "retry_log_level": "debug",  # Avoid log noise during transaction conflicts
    },
)
async def process_source_command(
    input_data: SourceProcessingInput,
) -> SourceProcessingOutput:
    """
    Process source content using the source_graph workflow
    """
    start_time = time.time()

    try:
        logger.info(f"Starting source processing for source: {input_data.source_id}")
        logger.info(f"Project IDs: {input_data.project_ids}")
        logger.info(f"Embed: {input_data.embed}")

        # 1. Get existing source record to update its command field
        source = await Source.get(input_data.source_id)
        if not source:
            raise ValueError(f"Source '{input_data.source_id}' not found")

        # Update source with command reference and start pipeline tracking
        source.command = (
            ensure_record_id(input_data.execution_context.command_id)
            if input_data.execution_context
            else None
        )
        await source.save()

        await set_pipeline_stage(str(source.id), PIPELINE_EXTRACTING)

        logger.info(f"Updated source {source.id} with command reference")

        # Always embed so vector search and knowledge graph run after upload
        embed = True

        # 2. Process source with all projects (artifacts ignored — insights removed)
        logger.info(f"Processing source with {len(input_data.project_ids)} projects")

        result = await source_graph.ainvoke(
            {  # type: ignore[arg-type]
                "content_state": input_data.content_state,
                "project_ids": input_data.project_ids,
                "embed": embed,
                "source_id": input_data.source_id,
            }
        )

        processed_source = result["source"]

        # Note: embedding is fire-and-forget (async job). Knowledge graph is
        # chained from embed_source (or submitted immediately when embedding is skipped).
        processing_time = time.time() - start_time
        logger.info(
            f"Successfully processed source: {processed_source.id} in {processing_time:.2f}s"
        )

        return SourceProcessingOutput(
            success=True,
            source_id=str(processed_source.id),
            embedded_chunks=0,
            processing_time=processing_time,
        )

    except ValueError as e:
        # Validation errors are permanent failures. Re-raise so surreal-commands
        # marks the job as `failed` (stop_on=[ValueError] already prevents
        # pointless retries). Returning a success=False result instead marks the
        # job `completed` (is_success() checks job status, not the payload),
        # which hid extraction failures and left the source without a retryable
        # `failed` status in the UI.
        logger.error(f"Source processing failed (permanent): {e}")
        raise
    except Exception as e:
        # Transient failure - will be retried (surreal-commands logs final failure)
        logger.debug(
            f"Transient error processing source {input_data.source_id}: {e}"
        )
        raise


# =============================================================================
# INGEST TEXT SOURCE COMMAND (promotion fast path — skip content extraction)
# =============================================================================


class IngestTextSourceInput(CommandInput):
    """Input for ingesting pre-extracted text into an existing source record."""

    source_id: str
    content: str
    title: str
    project_ids: List[str]
    # Accepted for API compatibility; ignored — insights feature removed
    artifacts: List[str] = []
    embed: bool


class IngestTextSourceOutput(CommandOutput):
    success: bool
    source_id: str
    processing_time: float
    error_message: Optional[str] = None


@command(
    "ingest_text_source",
    app="construction_os",
    retry={
        "max_attempts": 5,
        "wait_strategy": "exponential_jitter",
        "wait_min": 1,
        "wait_max": 60,
        "stop_on": [ValueError, ConfigurationError],
        "retry_log_level": "debug",
    },
)
async def ingest_text_source_command(
    input_data: IngestTextSourceInput,
) -> IngestTextSourceOutput:
    """
    Set full_text on an existing source and embed.

    Skips content-core extraction for promoted notes and playground output.
    Artifacts list is ignored (insights feature removed).
    """
    start_time = time.time()

    try:
        content = (input_data.content or "").strip()
        if not content:
            raise ValueError("Content is required for text ingestion")

        source = await Source.get(input_data.source_id)
        if not source:
            raise ValueError(f"Source '{input_data.source_id}' not found")

        source.command = (
            ensure_record_id(input_data.execution_context.command_id)
            if input_data.execution_context
            else None
        )
        source.full_text = content
        if input_data.title:
            source.title = input_data.title
        await source.save()

        for project_id in input_data.project_ids:
            await source.add_to_project(project_id)

        # Always embed promoted text so search + knowledge graph stay in sync
        await source.vectorize()

        processing_time = time.time() - start_time
        logger.info(
            f"Ingested text source {source.id} in {processing_time:.2f}s (embed=True)"
        )

        return IngestTextSourceOutput(
            success=True,
            source_id=str(source.id),
            processing_time=processing_time,
        )

    except ValueError as e:
        logger.error(f"Text source ingestion failed (permanent): {e}")
        raise
    except Exception as e:
        logger.debug(
            f"Transient error ingesting text source {input_data.source_id}: {e}"
        )
        raise

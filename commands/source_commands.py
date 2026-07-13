import time
from typing import Any, Dict, List, Optional

from loguru import logger
from pydantic import BaseModel
from surreal_commands import CommandInput, CommandOutput, command

from construction_os.database.repository import ensure_record_id
from construction_os.domain.project import Source
from construction_os.domain.artifact import Artifact
from construction_os.exceptions import ConfigurationError
from construction_os.knowledge.pipeline import (
    PIPELINE_EMBEDDING,
    PIPELINE_EXTRACTING,
    set_pipeline_stage,
)

try:
    from construction_os.graphs.source import source_graph
    from construction_os.graphs.artifact import graph as artifact_graph
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
    artifacts: List[str]
    embed: bool


class SourceProcessingOutput(CommandOutput):
    success: bool
    source_id: str
    embedded_chunks: int = 0
    insights_created: int = 0
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
        logger.info(f"Artifacts: {input_data.artifacts}")
        logger.info(f"Embed: {input_data.embed}")

        # 1. Load artifact objects from IDs
        artifacts = []
        for artifact_id in input_data.artifacts:
            logger.info(f"Loading artifact: {artifact_id}")
            artifact = await Artifact.get(artifact_id)
            if not artifact:
                raise ValueError(f"Artifact '{artifact_id}' not found")
            artifacts.append(artifact)

        logger.info(f"Loaded {len(artifacts)} artifacts")

        # 2. Get existing source record to update its command field
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

        # 3. Process source with all projects
        logger.info(f"Processing source with {len(input_data.project_ids)} projects")

        # Execute source_graph with all projects
        result = await source_graph.ainvoke(
            {  # type: ignore[arg-type]
                "content_state": input_data.content_state,
                "project_ids": input_data.project_ids,
                "apply_artifacts": artifacts,
                "embed": embed,
                "source_id": input_data.source_id,
            }
        )

        processed_source = result["source"]

        # 4. Gather processing results (project associations handled by source_graph)
        # Note: embedding is fire-and-forget (async job), so we can't query the
        # count here — it hasn't completed yet. The embed_source_command logs
        # the actual count when it finishes. Knowledge graph is chained from
        # embed_source (or submitted immediately when embedding is skipped).
        insights_list = await processed_source.get_insights()
        insights_created = len(insights_list)

        processing_time = time.time() - start_time
        logger.info(
            f"Successfully processed source: {processed_source.id} in {processing_time:.2f}s"
        )
        logger.info(
            f"Created {insights_created} insights, embedding submitted"
        )

        return SourceProcessingOutput(
            success=True,
            source_id=str(processed_source.id),
            embedded_chunks=0,
            insights_created=insights_created,
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
# RUN ARTIFACT COMMAND
# =============================================================================


class RunArtifactInput(CommandInput):
    """Input for running an artifact on an existing source."""

    source_id: str
    artifact_id: str


class RunArtifactOutput(CommandOutput):
    """Output from run_artifact command."""

    success: bool
    source_id: str
    artifact_id: str
    processing_time: float
    error_message: Optional[str] = None


@command(
    "run_artifact",
    app="construction_os",
    retry={
        "max_attempts": 5,
        "wait_strategy": "exponential_jitter",
        "wait_min": 1,
        "wait_max": 60,
        "stop_on": [ValueError, ConfigurationError],  # Don't retry validation/config errors
        "retry_log_level": "debug",
    },
)
async def run_artifact_command(
    input_data: RunArtifactInput,
) -> RunArtifactOutput:
    """
    Run an artifact on an existing source to generate an insight.

    This command runs the artifact graph which:
    1. Loads the source and artifact
    2. Calls the LLM to generate insight content
    3. Creates the insight via create_insight command (fire-and-forget)

    Use this command for UI-triggered insight generation to avoid blocking
    the HTTP request while the LLM processes.

    Retry Strategy:
    - Retries up to 5 times for transient failures (network, timeout, etc.)
    - Uses exponential-jitter backoff (1-60s)
    - Does NOT retry permanent failures (ValueError for validation errors)
    """
    start_time = time.time()

    try:
        logger.info(
            f"Running artifact {input_data.artifact_id} "
            f"on source {input_data.source_id}"
        )

        # Load source
        source = await Source.get(input_data.source_id)
        if not source:
            raise ValueError(f"Source '{input_data.source_id}' not found")

        # Load artifact
        artifact = await Artifact.get(input_data.artifact_id)
        if not artifact:
            raise ValueError(
                f"Artifact '{input_data.artifact_id}' not found"
            )

        # Run artifact graph (includes LLM call + insight creation)
        await artifact_graph.ainvoke(
            input=dict(source=source, artifact=artifact)
        )

        processing_time = time.time() - start_time
        logger.info(
            f"Successfully ran artifact {input_data.artifact_id} "
            f"on source {input_data.source_id} in {processing_time:.2f}s"
        )

        return RunArtifactOutput(
            success=True,
            source_id=input_data.source_id,
            artifact_id=input_data.artifact_id,
            processing_time=processing_time,
        )

    except ValueError as e:
        # Validation errors are permanent failures - don't retry
        processing_time = time.time() - start_time
        logger.error(
            f"Failed to run artifact {input_data.artifact_id} "
            f"on source {input_data.source_id}: {e}"
        )
        return RunArtifactOutput(
            success=False,
            source_id=input_data.source_id,
            artifact_id=input_data.artifact_id,
            processing_time=processing_time,
            error_message=str(e),
        )
    except Exception as e:
        # Transient failure - will be retried (surreal-commands logs final failure)
        logger.debug(
            f"Transient error running artifact {input_data.artifact_id} "
            f"on source {input_data.source_id}: {e}"
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
    artifacts: List[str]
    embed: bool


class IngestTextSourceOutput(CommandOutput):
    success: bool
    source_id: str
    insights_created: int = 0
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
    Set full_text on an existing source, embed, and optionally apply artifacts.

    Skips content-core extraction for promoted notes, insights, and playground output.
    """
    from construction_os.graphs.source import apply_artifacts_to_source

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
        await set_pipeline_stage(str(source.id), PIPELINE_EMBEDDING)
        await source.vectorize()

        artifacts: List[Artifact] = []
        for artifact_id in input_data.artifacts:
            artifact = await Artifact.get(artifact_id)
            if not artifact:
                raise ValueError(f"Artifact '{artifact_id}' not found")
            artifacts.append(artifact)

        insights_created = 0
        if artifacts:
            insights_created = await apply_artifacts_to_source(source, artifacts)

        processing_time = time.time() - start_time
        logger.info(
            f"Ingested text source {source.id} in {processing_time:.2f}s "
            f"(insights={insights_created}, embed=True)"
        )

        return IngestTextSourceOutput(
            success=True,
            source_id=str(source.id),
            insights_created=insights_created,
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

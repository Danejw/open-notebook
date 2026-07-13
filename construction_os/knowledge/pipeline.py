"""Source ingestion pipeline helpers: stage tracking and embed → knowledge graph chaining."""

from typing import Any, Dict, List, Optional, Tuple

from loguru import logger
from surreal_commands import submit_command

from construction_os.database.repository import ensure_record_id, repo_query

PIPELINE_EXTRACTING = "extracting"
PIPELINE_EMBEDDING = "embedding"
PIPELINE_KNOWLEDGE_GRAPH = "knowledge_graph"
PIPELINE_COMPLETED = "completed"
PIPELINE_FAILED = "failed"

ACTIVE_PIPELINE_STAGES = {
    PIPELINE_EXTRACTING,
    PIPELINE_EMBEDDING,
    PIPELINE_KNOWLEDGE_GRAPH,
}

STAGE_MESSAGES = {
    PIPELINE_EXTRACTING: "Extracting content…",
    PIPELINE_EMBEDDING: "Creating vector embeddings…",
    PIPELINE_KNOWLEDGE_GRAPH: "Building knowledge graph…",
    PIPELINE_COMPLETED: "Source processing completed successfully",
    PIPELINE_FAILED: "Source processing failed",
}


async def set_pipeline_stage(source_id: str, stage: str) -> None:
    """Persist the current ingestion pipeline stage on the source record."""
    await repo_query(
        "UPDATE $id SET pipeline_stage = $stage",
        {"id": ensure_record_id(source_id), "stage": stage},
    )


async def resolve_project_ids_for_source(
    source_id: str, project_ids: Optional[List[str]] = None
) -> List[str]:
    """Resolve project IDs from an explicit list or source→project reference edges."""
    if project_ids:
        return [str(p) for p in project_ids if p]
    rows = await repo_query(
        "SELECT VALUE out FROM reference WHERE in = $source_id",
        {"source_id": ensure_record_id(source_id)},
    )
    return [str(r) for r in (rows or []) if r]


def submit_auto_knowledge_graph(
    source_id: str,
    project_ids: Optional[List[str]] = None,
    *,
    force: bool = False,
    auto_select: bool = True,
) -> Optional[str]:
    """Queue knowledge-graph extraction for a source (fire-and-forget).

    Uses extractor=\"generic\" with auto_select so drawing/spec heuristics can
    upgrade the extractor. Pass explicit project_ids when known.
    """
    try:
        command_id = submit_command(
            "construction_os",
            "build_knowledge_graph",
            {
                "source_id": str(source_id),
                "project_ids": project_ids or [],
                "extractor": "generic",
                "force": force,
                "auto_select": auto_select,
            },
        )
        command_id_str = str(command_id)
        logger.info(
            f"Submitted build_knowledge_graph for source {source_id}: "
            f"command_id={command_id_str}"
        )
        return command_id_str
    except Exception as exc:
        logger.warning(
            f"Failed to submit knowledge graph build for {source_id}: {exc}"
        )
        return None


def resolve_pipeline_status(
    *,
    extract_status: Optional[str],
    pipeline_stage: Optional[str],
) -> Tuple[Optional[str], Optional[str], str]:
    """
    Map extract-command status + pipeline_stage into UI-facing status/stage/message.

    Keeps overall `status` as running until embed + knowledge graph finish so
    the frontend continues polling after content extraction completes.
    """
    if extract_status in ("new", "queued", "running"):
        stage = pipeline_stage or PIPELINE_EXTRACTING
        return extract_status, stage, STAGE_MESSAGES.get(stage, STAGE_MESSAGES[PIPELINE_EXTRACTING])

    if extract_status == "failed" or pipeline_stage == PIPELINE_FAILED:
        return "failed", PIPELINE_FAILED, STAGE_MESSAGES[PIPELINE_FAILED]

    if pipeline_stage == PIPELINE_EMBEDDING:
        return "running", PIPELINE_EMBEDDING, STAGE_MESSAGES[PIPELINE_EMBEDDING]

    if pipeline_stage == PIPELINE_KNOWLEDGE_GRAPH:
        return (
            "running",
            PIPELINE_KNOWLEDGE_GRAPH,
            STAGE_MESSAGES[PIPELINE_KNOWLEDGE_GRAPH],
        )

    if pipeline_stage == PIPELINE_EXTRACTING and extract_status == "completed":
        # Brief race between extract finishing and embed stage write
        return "running", PIPELINE_EMBEDDING, STAGE_MESSAGES[PIPELINE_EMBEDDING]

    if pipeline_stage == PIPELINE_COMPLETED or extract_status in (
        "completed",
        None,
    ):
        if pipeline_stage in ACTIVE_PIPELINE_STAGES:
            return (
                "running",
                pipeline_stage,
                STAGE_MESSAGES.get(pipeline_stage, STAGE_MESSAGES[PIPELINE_EXTRACTING]),
            )
        return (
            "completed",
            pipeline_stage or PIPELINE_COMPLETED,
            STAGE_MESSAGES[PIPELINE_COMPLETED],
        )

    if extract_status == "unknown":
        return "unknown", pipeline_stage, "Source processing status unknown"

    return (
        extract_status,
        pipeline_stage,
        f"Source processing status: {extract_status}",
    )


def pipeline_processing_info(
    base: Optional[Dict[str, Any]],
    stage: Optional[str],
) -> Optional[Dict[str, Any]]:
    """Attach pipeline stage to existing processing_info payload."""
    info = dict(base or {})
    if stage:
        info["stage"] = stage
        info["pipeline_stage"] = stage
    return info or None

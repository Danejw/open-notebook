"""Source ingestion pipeline helpers: stage tracking and embed → knowledge graph chaining."""

from typing import Any, Dict, List, Optional, Tuple

from loguru import logger
from surreal_commands import submit_command

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.exceptions import DatabaseOperationError

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

_ACTIVE_COMMAND_STATUSES = frozenset({"new", "queued", "running"})
_FAILED_COMMAND_STATUSES = frozenset({"failed"})


async def set_pipeline_stage(source_id: str, stage: str) -> None:
    """Persist the current ingestion pipeline stage on the source record."""
    await repo_query(
        "UPDATE $id SET pipeline_stage = $stage",
        {"id": ensure_record_id(source_id), "stage": stage},
    )


async def fail_pipeline(source_id: str) -> None:
    """Mark the source ingestion pipeline as permanently failed."""
    await set_pipeline_stage(source_id, PIPELINE_FAILED)


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


async def begin_embed_stage(source_id: str) -> str:
    """Submit embed_source, persist embed_command, set stage embedding.

    Raises DatabaseOperationError if submit fails (after marking pipeline failed).
    """
    try:
        command_id = submit_command(
            "construction_os",
            "embed_source",
            {"source_id": str(source_id)},
        )
        command_id_str = str(command_id)
        await repo_query(
            """
            UPDATE $id SET
                embed_command = $cmd,
                pipeline_stage = $stage
            """,
            {
                "id": ensure_record_id(source_id),
                "cmd": ensure_record_id(command_id_str),
                "stage": PIPELINE_EMBEDDING,
            },
        )
        logger.info(
            f"Submitted embed_source for source {source_id}: "
            f"command_id={command_id_str}"
        )
        return command_id_str
    except Exception as exc:
        logger.error(f"Failed to begin embed stage for {source_id}: {exc}")
        try:
            await fail_pipeline(source_id)
        except Exception:
            pass
        raise DatabaseOperationError(exc) from exc


async def begin_kg_stage(
    source_id: str,
    project_ids: Optional[List[str]] = None,
    *,
    force: bool = False,
    auto_select: bool = True,
) -> Optional[str]:
    """Queue knowledge-graph extraction, persist kg_command, set knowledge_graph stage.

    Returns command id on success, or None after fail_pipeline if submit fails.
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
        await repo_query(
            """
            UPDATE $id SET
                kg_command = $cmd,
                pipeline_stage = $stage
            """,
            {
                "id": ensure_record_id(source_id),
                "cmd": ensure_record_id(command_id_str),
                "stage": PIPELINE_KNOWLEDGE_GRAPH,
            },
        )
        logger.info(
            f"Submitted build_knowledge_graph for source {source_id}: "
            f"command_id={command_id_str}"
        )
        return command_id_str
    except Exception as exc:
        logger.warning(
            f"Failed to submit knowledge graph build for {source_id}: {exc}"
        )
        try:
            await fail_pipeline(source_id)
        except Exception:
            pass
        return None


async def submit_auto_knowledge_graph(
    source_id: str,
    project_ids: Optional[List[str]] = None,
    *,
    force: bool = False,
    auto_select: bool = True,
) -> Optional[str]:
    """Async alias for begin_kg_stage (historical name used by callers)."""
    return await begin_kg_stage(
        source_id,
        project_ids,
        force=force,
        auto_select=auto_select,
    )


def fetched_command_status(command: Any) -> Tuple[Optional[str], bool]:
    """Parse a FETCH'd command field into (status, present).

    present=False when the field is null/empty (no linked job).
    """
    if command is None or command == "":
        return None, False
    if isinstance(command, dict):
        status = command.get("status")
        return (str(status) if status is not None else "unknown"), True
    # Unresolved record reference
    return "unknown", True


def resolve_pipeline_status(
    *,
    extract_status: Optional[str],
    pipeline_stage: Optional[str],
    embed_command_status: Optional[str] = None,
    kg_command_status: Optional[str] = None,
    has_embed_command: Optional[bool] = None,
    has_kg_command: Optional[bool] = None,
) -> Tuple[Optional[str], Optional[str], str]:
    """
    Map extract + child-command statuses + pipeline_stage into UI status/stage/message.

    Keeps overall `status` as running until embed + knowledge graph finish so
    the frontend continues polling after content extraction completes.
    Child job failure / missing linkage surfaces as failed so Retry is available.
    """
    if extract_status in _ACTIVE_COMMAND_STATUSES:
        stage = pipeline_stage or PIPELINE_EXTRACTING
        return (
            extract_status,
            stage,
            STAGE_MESSAGES.get(stage, STAGE_MESSAGES[PIPELINE_EXTRACTING]),
        )

    if extract_status == "failed" or pipeline_stage == PIPELINE_FAILED:
        return "failed", PIPELINE_FAILED, STAGE_MESSAGES[PIPELINE_FAILED]

    if pipeline_stage == PIPELINE_EMBEDDING:
        if has_embed_command is False:
            return "failed", PIPELINE_FAILED, STAGE_MESSAGES[PIPELINE_FAILED]
        if embed_command_status in _FAILED_COMMAND_STATUSES:
            return "failed", PIPELINE_FAILED, STAGE_MESSAGES[PIPELINE_FAILED]
        return "running", PIPELINE_EMBEDDING, STAGE_MESSAGES[PIPELINE_EMBEDDING]

    if pipeline_stage == PIPELINE_KNOWLEDGE_GRAPH:
        if has_kg_command is False:
            return "failed", PIPELINE_FAILED, STAGE_MESSAGES[PIPELINE_FAILED]
        if kg_command_status in _FAILED_COMMAND_STATUSES:
            return "failed", PIPELINE_FAILED, STAGE_MESSAGES[PIPELINE_FAILED]
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


async def heal_pipeline_stage_if_needed(
    source_id: str,
    *,
    current_stage: Optional[str],
    resolved_stage: Optional[str],
) -> None:
    """Best-effort write-through when reconcile maps an active stage to failed."""
    if resolved_stage != PIPELINE_FAILED:
        return
    if current_stage == PIPELINE_FAILED:
        return
    if current_stage not in ACTIVE_PIPELINE_STAGES:
        return
    try:
        await fail_pipeline(source_id)
        logger.info(
            f"Healed source {source_id} pipeline_stage "
            f"{current_stage!r} -> {PIPELINE_FAILED!r}"
        )
    except Exception as exc:
        logger.warning(f"Failed to heal pipeline stage for {source_id}: {exc}")


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

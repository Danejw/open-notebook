"""Async commands for building knowledge graph projections."""

from __future__ import annotations

import hashlib
import time
from datetime import datetime
from typing import List, Optional

from loguru import logger
from pydantic import Field
from surreal_commands import CommandInput, CommandOutput, command

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.knowledge_graph import KgExtractionRun
from construction_os.domain.project import Source
from construction_os.exceptions import ConfigurationError
from construction_os.knowledge.extractors.registry import get_extractor
from construction_os.knowledge.writer import write_extraction_result


class BuildKGInput(CommandInput):
    source_id: str
    project_ids: List[str] = Field(default_factory=list)
    extractor: str = "generic"
    force: bool = False


class BuildKGOutput(CommandOutput):
    success: bool
    source_id: str
    extractor: str
    skipped: bool = False
    stats: dict = Field(default_factory=dict)
    processing_time: float = 0.0
    error_message: Optional[str] = None


async def _load_chunks(source_id: str) -> list:
    rows = await repo_query(
        """
        SELECT id, content, order FROM source_embedding
        WHERE source = $source_id
        ORDER BY order ASC
        """,
        {"source_id": ensure_record_id(source_id)},
    )
    return rows or []


async def _resolve_project_ids(source_id: str, project_ids: List[str]) -> List[str]:
    if project_ids:
        return project_ids
    rows = await repo_query(
        "SELECT VALUE out FROM reference WHERE in = $source_id",
        {"source_id": ensure_record_id(source_id)},
    )
    return [str(r) for r in (rows or []) if r]


@command(
    "build_knowledge_graph",
    app="construction_os",
    retry={
        "max_attempts": 5,
        "wait_strategy": "exponential_jitter",
        "wait_min": 1,
        "wait_max": 60,
        "stop_on": [ValueError, ConfigurationError, KeyError],
        "retry_log_level": "debug",
    },
)
async def build_knowledge_graph_command(input_data: BuildKGInput) -> BuildKGOutput:
    """Extract and write a knowledge graph projection for a source."""
    start = time.time()
    extractor_id = input_data.extractor or "generic"

    try:
        source = await Source.get(input_data.source_id)
        if not source:
            raise ValueError(f"Source '{input_data.source_id}' not found")

        full_text = source.full_text or ""
        content_hash = hashlib.sha256(full_text.encode("utf-8")).hexdigest()

        # Persist content_hash on source for skip checks
        if getattr(source, "content_hash", None) != content_hash:
            await repo_query(
                "UPDATE $id SET content_hash = $content_hash",
                {
                    "id": ensure_record_id(source.id),
                    "content_hash": content_hash,
                },
            )

        project_ids = await _resolve_project_ids(
            str(source.id), input_data.project_ids or []
        )
        if not project_ids:
            logger.info(
                f"No projects linked to source {source.id}; skipping KG build"
            )
            return BuildKGOutput(
                success=True,
                source_id=str(source.id),
                extractor=extractor_id,
                skipped=True,
                stats={"reason": "no_projects"},
                processing_time=time.time() - start,
            )

        if not input_data.force:
            prior = await repo_query(
                """
                SELECT * FROM kg_extraction_run
                WHERE source_id = $source_id
                  AND extractor = $extractor
                  AND status = "completed"
                  AND content_hash = $content_hash
                LIMIT 1
                """,
                {
                    "source_id": ensure_record_id(source.id),
                    "extractor": extractor_id,
                    "content_hash": content_hash,
                },
            )
            if prior:
                return BuildKGOutput(
                    success=True,
                    source_id=str(source.id),
                    extractor=extractor_id,
                    skipped=True,
                    stats={"reason": "unchanged_content_hash"},
                    processing_time=time.time() - start,
                )

        extractor = get_extractor(extractor_id)
        chunks = await _load_chunks(str(source.id))
        aggregate_stats: dict = {}

        for project_id in project_ids:
            run = KgExtractionRun(
                source_id=str(source.id),
                project_id=project_id,
                extractor=extractor_id,
                extractor_version=getattr(extractor, "version", None),
                status="running",
                content_hash=content_hash,
                started_at=datetime.utcnow(),
                command_id=(
                    str(input_data.execution_context.command_id)
                    if input_data.execution_context
                    else None
                ),
            )
            await run.save()

            try:
                result = await extractor.extract(
                    full_text=full_text,
                    chunks=chunks,
                    source_id=str(source.id),
                    project_id=project_id,
                )
                stats = await write_extraction_result(
                    result=result,
                    source_id=str(source.id),
                    project_id=project_id,
                    chunks=chunks,
                )
                run.status = "completed"
                run.stats = stats
                run.finished_at = datetime.utcnow()
                await run.save()
                for key, value in stats.items():
                    if isinstance(value, (int, float)):
                        aggregate_stats[key] = aggregate_stats.get(key, 0) + value
            except Exception as e:
                run.status = "failed"
                run.error_message = str(e)
                run.finished_at = datetime.utcnow()
                await run.save()
                raise

        return BuildKGOutput(
            success=True,
            source_id=str(source.id),
            extractor=extractor_id,
            skipped=False,
            stats=aggregate_stats,
            processing_time=time.time() - start,
        )
    except (ValueError, KeyError, ConfigurationError) as e:
        logger.error(f"KG build failed (permanent): {e}")
        raise
    except Exception as e:
        logger.debug(f"Transient KG build error for {input_data.source_id}: {e}")
        raise

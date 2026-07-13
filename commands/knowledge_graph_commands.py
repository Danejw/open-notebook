"""Async commands for building knowledge graph projections."""

import hashlib
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger
from pydantic import Field
from surreal_commands import CommandInput, CommandOutput, command

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.knowledge_graph import KgExtractionRun
from construction_os.domain.project import Source
from construction_os.exceptions import ConfigurationError
from construction_os.knowledge.extractors.crossrefs import count_detected_callouts
from construction_os.knowledge.extractors.parse import (
    extraction_is_empty,
    extraction_missing_expected_relations,
    relations_warning_stats,
    stats_have_graph_content,
)
from construction_os.knowledge.project_linker import link_project_references
from construction_os.knowledge.extractors.registry import get_extractor
from construction_os.knowledge.extractors.select import select_extractor_id
from construction_os.knowledge.pipeline import (
    PIPELINE_COMPLETED,
    PIPELINE_FAILED,
    resolve_project_ids_for_source,
    set_pipeline_stage,
)
from construction_os.knowledge.writer import write_extraction_result


def _source_file_path(source: Source) -> Optional[str]:
    asset = getattr(source, "asset", None)
    if asset is None:
        return None
    if isinstance(asset, dict):
        path = asset.get("file_path") or asset.get("url")
        return str(path) if path else None
    path = getattr(asset, "file_path", None) or getattr(asset, "url", None)
    return str(path) if path else None


def _diagnostic_stats(
    *,
    full_text: str,
    extractor_id: str,
    base: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    stats = dict(base or {})
    stats.setdefault("full_text_length", len(full_text or ""))
    stats.setdefault("callout_count", count_detected_callouts(full_text or ""))
    stats.setdefault("extractor", extractor_id)
    return stats


class BuildKGInput(CommandInput):
    source_id: str
    project_ids: List[str] = Field(default_factory=list)
    extractor: str = "generic"
    force: bool = False
    # When True and extractor is "generic", pick drawing/spec/etc from heuristics.
    auto_select: bool = True


class BuildKGOutput(CommandOutput):
    success: bool
    source_id: str
    extractor: str
    skipped: bool = False
    stats: Dict[str, Any] = Field(default_factory=dict)
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


async def _fail_run(
    *,
    source_id: str,
    project_id: Optional[str],
    extractor_id: str,
    extractor_version: Optional[str],
    content_hash: str,
    error_message: str,
    command_id: Optional[str],
    stats: Optional[Dict[str, Any]] = None,
) -> KgExtractionRun:
    run = KgExtractionRun(
        source_id=source_id,
        project_id=project_id,
        extractor=extractor_id,
        extractor_version=extractor_version,
        status="failed",
        content_hash=content_hash,
        stats=stats or {},
        error_message=error_message,
        started_at=datetime.utcnow(),
        finished_at=datetime.utcnow(),
        command_id=command_id,
    )
    await run.save()
    return run


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
    requested_extractor = input_data.extractor or "generic"
    command_id = (
        str(input_data.execution_context.command_id)
        if input_data.execution_context
        else None
    )

    try:
        source = await Source.get(input_data.source_id)
        if not source:
            raise ValueError(f"Source '{input_data.source_id}' not found")

        extractor_id = select_extractor_id(
            requested=requested_extractor,
            source=source,
            auto_select_generic=bool(input_data.auto_select),
        )
        if extractor_id != requested_extractor:
            logger.info(
                "Auto-selected KG extractor {} (requested {}) for source {}",
                extractor_id,
                requested_extractor,
                source.id,
            )

        full_text = source.full_text or ""
        content_hash = hashlib.sha256(full_text.encode("utf-8")).hexdigest()

        if getattr(source, "content_hash", None) != content_hash:
            await repo_query(
                "UPDATE $id SET content_hash = $content_hash",
                {
                    "id": ensure_record_id(source.id),
                    "content_hash": content_hash,
                },
            )

        project_ids = await resolve_project_ids_for_source(
            str(source.id), input_data.project_ids or []
        )

        extractor = get_extractor(extractor_id)
        extractor_version = getattr(extractor, "version", None)

        if not project_ids:
            msg = "no_projects: Source is not linked to any project"
            logger.warning("{} ({})", msg, source.id)
            await _fail_run(
                source_id=str(source.id),
                project_id=None,
                extractor_id=extractor_id,
                extractor_version=extractor_version,
                content_hash=content_hash,
                error_message=msg,
                command_id=command_id,
                stats={"reason": "no_projects"},
            )
            await set_pipeline_stage(str(source.id), PIPELINE_FAILED)
            raise ValueError(msg)

        if not full_text.strip():
            msg = "no_text: Source has no text content to extract"
            logger.warning("{} ({})", msg, source.id)
            for project_id in project_ids:
                await _fail_run(
                    source_id=str(source.id),
                    project_id=project_id,
                    extractor_id=extractor_id,
                    extractor_version=extractor_version,
                    content_hash=content_hash,
                    error_message=msg,
                    command_id=command_id,
                    stats={"reason": "no_text"},
                )
            await set_pipeline_stage(str(source.id), PIPELINE_FAILED)
            raise ValueError(msg)

        if not input_data.force:
            prior = await repo_query(
                """
                SELECT * FROM kg_extraction_run
                WHERE source_id = $source_id
                  AND extractor = $extractor
                  AND status = "completed"
                  AND content_hash = $content_hash
                ORDER BY started_at DESC
                LIMIT 5
                """,
                {
                    "source_id": ensure_record_id(source.id),
                    "extractor": extractor_id,
                    "content_hash": content_hash,
                },
            )
            # Only skip when a prior completed run actually wrote graph content
            contentful = next(
                (row for row in (prior or []) if stats_have_graph_content(row.get("stats"))),
                None,
            )
            if contentful:
                await set_pipeline_stage(str(source.id), PIPELINE_COMPLETED)
                return BuildKGOutput(
                    success=True,
                    source_id=str(source.id),
                    extractor=extractor_id,
                    skipped=True,
                    stats={
                        "reason": "unchanged_content_hash",
                        **(contentful.get("stats") or {}),
                    },
                    processing_time=time.time() - start,
                )

        chunks = await _load_chunks(str(source.id))
        aggregate_stats: dict = {}
        source_title = getattr(source, "title", None)
        file_path = _source_file_path(source)
        topics = list(getattr(source, "topics", None) or [])

        logger.info(
            "KG build start source={} extractor={} text_len={} callouts={} "
            "title={!r} file_path={!r}",
            source.id,
            extractor_id,
            len(full_text),
            count_detected_callouts(full_text),
            source_title,
            file_path,
        )

        for project_id in project_ids:
            run = KgExtractionRun(
                source_id=str(source.id),
                project_id=project_id,
                extractor=extractor_id,
                extractor_version=extractor_version,
                status="running",
                content_hash=content_hash,
                started_at=datetime.utcnow(),
                command_id=command_id,
            )
            await run.save()

            try:
                result = await extractor.extract(
                    full_text=full_text,
                    chunks=chunks,
                    source_id=str(source.id),
                    project_id=project_id,
                    source_title=source_title,
                    file_path=file_path,
                    topics=topics,
                )
                logger.info(
                    "KG extract payload stats for {}: {}",
                    source.id,
                    result.stats,
                )
                if extraction_is_empty(result.payload):
                    msg = (
                        "empty_extraction: No entities, claims, or relations after "
                        "LLM + deterministic parsers for non-empty source text "
                        f"(full_text_length={len(full_text)}, "
                        f"callout_count={count_detected_callouts(full_text)}, "
                        f"extractor={extractor_id})"
                    )
                    run.status = "failed"
                    run.error_message = msg
                    run.stats = _diagnostic_stats(
                        full_text=full_text,
                        extractor_id=extractor_id,
                        base=result.stats
                        or {
                            "entities": 0,
                            "claims": 0,
                            "relations": 0,
                            "mentions": 0,
                        },
                    )
                    run.finished_at = datetime.utcnow()
                    await run.save()
                    await set_pipeline_stage(str(source.id), PIPELINE_FAILED)
                    raise ValueError(msg)

                missing_rels = extraction_missing_expected_relations(
                    result.payload, full_text, extractor_id
                )
                if missing_rels:
                    run.status = "failed"
                    run.error_message = missing_rels
                    run.stats = _diagnostic_stats(
                        full_text=full_text,
                        extractor_id=extractor_id,
                        base={
                            **(result.stats or {}),
                            "relations": len(result.payload.relations),
                        },
                    )
                    run.finished_at = datetime.utcnow()
                    await run.save()
                    await set_pipeline_stage(str(source.id), PIPELINE_FAILED)
                    raise ValueError(missing_rels)

                stats = await write_extraction_result(
                    result=result,
                    source_id=str(source.id),
                    project_id=project_id,
                    chunks=chunks,
                )
                warning = relations_warning_stats(result.payload)
                if warning:
                    stats = {**stats, "relations_warning": warning}
                stats = _diagnostic_stats(
                    full_text=full_text,
                    extractor_id=extractor_id,
                    base=stats,
                )
                run.status = "completed"
                run.stats = stats
                run.finished_at = datetime.utcnow()
                await run.save()
                for key, value in stats.items():
                    if isinstance(value, (int, float)):
                        aggregate_stats[key] = aggregate_stats.get(key, 0) + value
                try:
                    link_stats = await link_project_references(project_id)
                    for key, value in (link_stats or {}).items():
                        if isinstance(value, (int, float)):
                            aggregate_stats[key] = (
                                aggregate_stats.get(key, 0) + value
                            )
                except Exception as link_err:
                    logger.warning(
                        "Project link pass failed for {}: {}", project_id, link_err
                    )
            except ValueError:
                raise
            except Exception as e:
                run.status = "failed"
                run.error_message = str(e)
                run.finished_at = datetime.utcnow()
                await run.save()
                await set_pipeline_stage(str(source.id), PIPELINE_FAILED)
                raise

        await set_pipeline_stage(str(source.id), PIPELINE_COMPLETED)
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
        try:
            await set_pipeline_stage(input_data.source_id, PIPELINE_FAILED)
        except Exception:
            pass
        raise
    except Exception as e:
        logger.debug(f"Transient KG build error for {input_data.source_id}: {e}")
        raise

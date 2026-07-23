"""Knowledge graph API: extractors, projections, project memory, rebuild."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from construction_os.domain.knowledge_graph import KnowledgeGraphRepository
from construction_os.domain.project import Project, Source
from construction_os.knowledge.backfill import (
    backfill_legacy_provenance,
    provenance_metrics,
)
from construction_os.knowledge.extractors.registry import list_extractors
from construction_os.knowledge.pipeline import begin_kg_stage
from construction_os.knowledge.project_linker import link_project_references

router = APIRouter()


class KnowledgeExtractRequest(BaseModel):
    extractor: str = Field(..., description="Extractor id (generic, contract, drawing, spec, email)")
    project_id: Optional[str] = Field(
        None, description="Project scope; defaults to first linked project"
    )
    force: bool = Field(False, description="Re-extract even if content hash unchanged")


class KnowledgeExtractResponse(BaseModel):
    command_id: str
    source_id: str
    extractor: str


class KnowledgeRebuildRequest(BaseModel):
    force: bool = True
    extractor: str = "generic"


class KnowledgeBackfillRequest(BaseModel):
    dry_run: bool = Field(
        True,
        description="When true, report would-be updates without writing (KG-010)",
    )
    limit: Optional[int] = Field(
        None,
        ge=1,
        description="Optional max rows per backfill step",
    )


@router.get("/sources/{source_id}/knowledge/extractors")
async def get_source_extractors(source_id: str):
    """List available extractors and last run status for this source."""
    source = await Source.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    latest = await KnowledgeGraphRepository.latest_runs_by_extractor(source_id)
    extractors = []
    for ext in list_extractors():
        run = latest.get(ext["id"])
        extractors.append(
            {
                **ext,
                "last_run": run,
            }
        )
    return {"extractors": extractors}


@router.post(
    "/sources/{source_id}/knowledge/extract",
    response_model=KnowledgeExtractResponse,
)
async def extract_source_knowledge(source_id: str, request: KnowledgeExtractRequest):
    """Submit a knowledge graph extraction job for a source."""
    source = await Source.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    known = {e["id"] for e in list_extractors()}
    if request.extractor not in known:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown extractor '{request.extractor}'. Valid: {sorted(known)}",
        )

    project_ids: List[str] = []
    if request.project_id:
        project = await Project.get(request.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        project_ids = [request.project_id]

    try:
        command_id = await begin_kg_stage(
            source_id,
            project_ids,
            extractor=request.extractor,
            force=request.force,
            # Specialized extractors keep their id; generic may auto-upgrade.
            auto_select=request.extractor == "generic",
        )
        if not command_id:
            raise RuntimeError("Failed to queue knowledge graph extraction")
        return KnowledgeExtractResponse(
            command_id=str(command_id),
            source_id=source_id,
            extractor=request.extractor,
        )
    except Exception as e:
        logger.error(f"Failed to submit KG extract for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sources/{source_id}/knowledge")
async def get_source_knowledge(source_id: str):
    """Entities, claims, relations, and recent runs for a source."""
    source = await Source.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return await KnowledgeGraphRepository.list_source_knowledge(source_id)


@router.get("/projects/{project_id}/knowledge/entities")
async def list_project_entities(
    project_id: str,
    entity_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """Browse project memory entities."""
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    entities = await KnowledgeGraphRepository.list_entities_for_project(
        project_id, entity_type=entity_type, query=q, limit=limit
    )
    return {"entities": entities, "total_count": len(entities)}


@router.get("/projects/{project_id}/knowledge/entities/{entity_id}")
async def get_project_entity(project_id: str, entity_id: str):
    """Entity detail with claims and relations (evidence trail)."""
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    detail = await KnowledgeGraphRepository.entity_detail(
        entity_id, project_id=project_id
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Entity not found")
    entity = detail.get("entity") or {}
    if str(entity.get("project_id")) != project_id and str(
        entity.get("project_id")
    ) != str(project.id):
        # Soft check — Surreal may return RecordID objects
        if project_id not in str(entity.get("project_id")):
            raise HTTPException(status_code=404, detail="Entity not in project")
    return detail


@router.post("/projects/{project_id}/knowledge/rebuild")
async def rebuild_project_knowledge(
    project_id: str, request: KnowledgeRebuildRequest = KnowledgeRebuildRequest()
):
    """Re-run the generic (or specified) extractor on all project sources."""
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sources = await project.get_sources()
    command_ids: List[str] = []
    for source in sources:
        try:
            command_id = await begin_kg_stage(
                str(source.id),
                [project_id],
                extractor=request.extractor,
                force=request.force,
                auto_select=request.extractor == "generic",
            )
            if command_id:
                command_ids.append(str(command_id))
        except Exception as e:
            logger.warning(f"Failed to queue KG rebuild for {source.id}: {e}")

    return {
        "project_id": project_id,
        "jobs_submitted": len(command_ids),
        "command_ids": command_ids,
        "extractor": request.extractor,
    }


@router.post("/projects/{project_id}/knowledge/link")
async def link_project_knowledge(project_id: str):
    """Run cross-source REFERENCES linking for a project (idempotent)."""
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        stats = await link_project_references(project_id)
        return {"project_id": project_id, "stats": stats}
    except Exception as e:
        logger.error(f"Project knowledge link failed for {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/knowledge/backfill-provenance")
async def backfill_project_provenance(
    project_id: str,
    request: KnowledgeBackfillRequest = KnowledgeBackfillRequest(),
):
    """
    Materialize supporting_sources, mention offsets, and derived flags (KG-010).

    Updates existing rows in place — does not wipe kg_* tables. Prefer this for
    legacy provenance; use /knowledge/rebuild when full re-extract is needed.
    """
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    before = await provenance_metrics(project_id=project_id)
    try:
        result = await backfill_legacy_provenance(
            project_id=project_id,
            dry_run=request.dry_run,
            limit=request.limit,
        )
    except Exception as e:
        logger.error(f"KG provenance backfill failed for {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    after = await provenance_metrics(project_id=project_id)
    return {
        "project_id": project_id,
        "before": before,
        "result": result,
        "after": after,
    }

"""Knowledge graph visualization projection API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from construction_os.domain.project import Project, Source
from construction_os.knowledge import graph_projection as gp

router = APIRouter(prefix="/knowledge-graph")


class GraphSearchRequest(BaseModel):
    project_id: str
    q: str
    limit: int = Field(30, ge=1, le=100)


class GraphPathsRequest(BaseModel):
    project_id: str
    from_id: str
    to_id: str
    max_depth: int = Field(4, ge=1, le=8)


class GraphLayoutRequest(BaseModel):
    positions: Dict[str, Any]
    algorithm: str = "forceatlas2"
    graph_version: Optional[int] = None


@router.get("/projects/{project_id}/overview")
async def get_project_graph_overview(
    project_id: str,
    max_nodes: int = Query(450, ge=50, le=800),
):
    """Bounded overview: sources, communities, top entities."""
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    slice_dto = await gp.project_overview(project_id, max_nodes=max_nodes)
    return slice_dto.model_dump(by_alias=False)


@router.get("/nodes/{node_id}")
async def get_graph_node(
    node_id: str,
    project_id: str = Query(..., description="Project scope (required)"),
):
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    detail = await gp.get_node_detail(node_id, project_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Node not found in project")
    return detail.model_dump()


@router.get("/nodes/{node_id}/neighbors")
async def get_graph_neighbors(
    node_id: str,
    project_id: str = Query(...),
    depth: int = Query(1, ge=1, le=3),
    relation_types: Optional[str] = Query(
        None, description="Comma-separated relation types"
    ),
    node_kinds: Optional[str] = Query(
        None,
        description="Comma-separated: source,chunk,entity,claim,community",
    ),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(50, ge=1, le=200),
):
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    kinds = [k.strip() for k in node_kinds.split(",")] if node_kinds else None
    rels = (
        [r.strip() for r in relation_types.split(",")] if relation_types else None
    )
    # Ensure node exists in project before expanding
    detail = await gp.get_node_detail(node_id, project_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Node not found in project")
    slice_dto = await gp.get_neighbors(
        node_id,
        project_id,
        depth=depth,
        relation_types=rels,
        node_kinds=kinds,
        min_confidence=min_confidence,
        limit=limit,
    )
    return slice_dto.model_dump()


@router.post("/search")
async def search_graph(request: GraphSearchRequest):
    project = await Project.get(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    slice_dto = await gp.search_graph_nodes(
        request.project_id, request.q, limit=request.limit
    )
    return slice_dto.model_dump()


@router.post("/paths")
async def graph_paths(request: GraphPathsRequest):
    project = await Project.get(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    slice_dto = await gp.find_paths(
        request.project_id,
        request.from_id,
        request.to_id,
        max_depth=request.max_depth,
    )
    return slice_dto.model_dump()


@router.get("/sources/{source_id}/subgraph")
async def get_source_subgraph(
    source_id: str,
    project_id: str = Query(...),
):
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    source = await Source.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    slice_dto = await gp.source_subgraph(source_id, project_id)
    if not slice_dto.nodes:
        raise HTTPException(
            status_code=404, detail="Source not linked to project or empty subgraph"
        )
    return slice_dto.model_dump()


@router.get("/query-runs/{run_id}")
async def get_query_run(run_id: str):
    result = await gp.get_query_run_slice(run_id)
    if not result:
        raise HTTPException(status_code=404, detail="Query run not found")
    run, slice_dto = result
    return {
        "run": {
            "id": str(run.id),
            "project_id": str(run.project_id),
            "query": run.query,
            "retrieval_mode": run.retrieval_mode,
            "seeds": run.seeds,
            "paths": run.paths,
            "cited_ids": run.cited_ids,
            "status": run.status,
            "metadata": run.metadata,
        },
        "slice": slice_dto.model_dump(),
    }


@router.get("/projects/{project_id}/layout")
async def get_project_layout(
    project_id: str,
    graph_version: Optional[int] = Query(None),
):
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    layout = await gp.get_layout(project_id, graph_version=graph_version)
    if not layout:
        return {"layout": None, "graph_version": await gp.get_graph_version(project_id)}
    return {
        "layout": {
            "id": str(layout.get("id")),
            "project_id": project_id,
            "graph_version": layout.get("graph_version"),
            "positions": layout.get("positions") or {},
            "algorithm": layout.get("algorithm"),
        }
    }


@router.put("/projects/{project_id}/layout")
async def put_project_layout(project_id: str, request: GraphLayoutRequest):
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    saved = await gp.save_layout(
        project_id,
        positions=request.positions,
        algorithm=request.algorithm,
        graph_version=request.graph_version,
    )
    return {"layout": saved}

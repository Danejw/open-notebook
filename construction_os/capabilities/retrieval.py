"""search_project_knowledge capability."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import require_project_session
from construction_os.capabilities.models import (
    CapabilityRuntimeContext,
    EvidenceItemOut,
)
from construction_os.graphs.chat_context import (
    eligible_artifact_ids,
    eligible_source_ids,
)
from construction_os.retrieval import retrieve


class SearchProjectKnowledgeInput(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(default=8, ge=1, le=25)
    mode: Literal["auto", "vector", "hybrid", "graph"] = "auto"


class SearchProjectKnowledgeOutput(BaseModel):
    results: list[EvidenceItemOut] = Field(default_factory=list)
    retrieval: dict[str, Any] = Field(default_factory=dict)


def _item_type(item_id: str, parent_id: Optional[str]) -> str:
    rid = str(item_id or "")
    parent = str(parent_id or "")
    if rid.startswith("note:") or parent.startswith("note:"):
        return "project_artifact"
    return "source"


def _excerpt(item: Any) -> Optional[str]:
    if getattr(item, "matches", None):
        parts = [str(m) for m in item.matches if m is not None]
        text = "\n".join(parts).strip()
        if text:
            return text[:1200]
    content = getattr(item, "content", None)
    if content is not None:
        return str(content)[:1200]
    return None


async def search_project_knowledge(
    ctx: CapabilityRuntimeContext,
    inputs: SearchProjectKnowledgeInput,
) -> SearchProjectKnowledgeOutput:
    await require_project_session(ctx)

    source_pool = eligible_source_ids(ctx.context_config)
    artifact_pool = eligible_artifact_ids(ctx.context_config)
    search_sources = bool(source_pool) if ctx.context_config else True
    search_notes = bool(artifact_pool) if ctx.context_config else True
    if ctx.context_config and not source_pool and not artifact_pool:
        return SearchProjectKnowledgeOutput(
            results=[],
            retrieval={
                "mode_requested": inputs.mode,
                "mode_used": None,
                "source_count": 0,
                "project_artifact_count": 0,
                "note": "No sources or Project Artifacts selected in context_config",
            },
        )

    bundle = await retrieve(
        inputs.query,
        project_id=ctx.project_id,
        mode=inputs.mode,
        limit=max(inputs.limit * 2, inputs.limit),
        search_sources=search_sources,
        search_notes=search_notes,
        minimum_score=0.15,
    )

    results: list[EvidenceItemOut] = []
    source_count = 0
    artifact_count = 0
    for item in bundle.items:
        rid = str(item.id or "")
        parent = str(item.parent_id or "")
        kind = _item_type(rid, parent)
        if ctx.context_config:
            if kind == "project_artifact":
                if rid not in artifact_pool and parent not in artifact_pool:
                    continue
            elif source_pool and rid not in source_pool and parent not in source_pool:
                continue
        if kind == "project_artifact":
            artifact_count += 1
        else:
            source_count += 1
        results.append(
            EvidenceItemOut(
                id=rid,
                title=item.title,
                type=kind,
                excerpt=_excerpt(item),
                score=float(item.score) if item.score is not None else None,
                parent_id=item.parent_id,
                provenance={
                    "retrieval_source": item.source,
                    "matches": item.matches[:3] if item.matches else None,
                },
            )
        )
        if len(results) >= inputs.limit:
            break

    return SearchProjectKnowledgeOutput(
        results=results,
        retrieval={
            "mode_requested": inputs.mode,
            "mode_used": bundle.retrieval_mode_used,
            "source_count": source_count,
            "project_artifact_count": artifact_count,
            "fallback_reason": bundle.fallback_reason,
        },
    )

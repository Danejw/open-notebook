"""get_project_context capability."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import require_project_session
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.domain.project import Project, get_project_scope_ids
from construction_os.exceptions import NotFoundError
from construction_os.utils.chat_session import session_record_fields
from construction_os.domain.project import ChatSession
from construction_os.services.project_memory import get_project_memory


class GetProjectContextInput(BaseModel):
    """No model-supplied project/session IDs — trusted runtime only."""

    pass


class GetProjectContextOutput(BaseModel):
    project: dict[str, Any]
    session_id: str
    counts: dict[str, int]
    explicit_selections: dict[str, Any]
    project_memory: Optional[dict[str, Any]] = None
    context_config: Optional[dict[str, Any]] = None
    relevant_config: dict[str, Any] = Field(default_factory=dict)


async def get_project_context(
    ctx: CapabilityRuntimeContext,
    _inputs: GetProjectContextInput | None = None,
) -> GetProjectContextOutput:
    await require_project_session(ctx)
    project = await Project.get(ctx.project_id)
    if not project:
        raise NotFoundError(f"Project not found: {ctx.project_id}")

    source_ids, artifact_ids = await get_project_scope_ids(ctx.project_id)
    session = await ChatSession.get(ctx.session_id)
    session_fields = session_record_fields(session) if session else {}
    memory = await get_project_memory(ctx.project_id)

    return GetProjectContextOutput(
        project={
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "archived": getattr(project, "archived", False),
        },
        session_id=ctx.session_id,
        counts={
            "sources": len(source_ids),
            "project_artifacts": len(artifact_ids),
        },
        explicit_selections={
            "skill_ids": list(ctx.explicit_skill_ids),
            "collection_ids": list(ctx.explicit_collection_ids),
            "mcp_tool_ids": list(ctx.explicit_mcp_tool_ids),
            "html_template_id": ctx.explicit_html_template_id,
            "artifact_template_id": ctx.explicit_artifact_template_id,
            "session": {
                "skill_ids": session_fields.get("skill_ids") or [],
                "collection_ids": session_fields.get("collection_ids") or [],
                "html_template_id": session_fields.get("html_template_id"),
                "model_override": session_fields.get("model_override"),
            },
        },
        project_memory=memory.model_dump() if memory else None,
        context_config=ctx.context_config,
        relevant_config={
            "model_override": ctx.model_override,
            "allow_project_artifact_save": ctx.allow_project_artifact_save,
        },
    )

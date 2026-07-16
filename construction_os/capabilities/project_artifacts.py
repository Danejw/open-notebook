"""save_project_artifact capability — only writable native tool in V1."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import (
    require_project_artifact_save,
    require_project_session,
)
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.services.project_artifacts import create_project_artifact


class SaveProjectArtifactInput(BaseModel):
    content: str = Field(..., min_length=1)
    title: Optional[str] = None
    artifact_kind: Optional[Literal["manual", "ai", "generated"]] = "ai"
    idempotency_key: Optional[str] = Field(
        default=None,
        description=(
            "Optional key to prevent duplicate saves on retry. "
            "Defaults to the current tool-call / message id when omitted."
        ),
    )


class SaveProjectArtifactOutput(BaseModel):
    project_artifact: dict[str, Any]
    created: bool = True
    note: str = "Project Artifact saved to the active project."


async def save_project_artifact(
    ctx: CapabilityRuntimeContext,
    inputs: SaveProjectArtifactInput,
    *,
    tool_call_id: Optional[str] = None,
) -> SaveProjectArtifactOutput:
    await require_project_session(ctx)
    require_project_artifact_save(ctx)

    key = (
        inputs.idempotency_key
        or tool_call_id
        or (f"{ctx.session_id}:{ctx.message_id}" if ctx.message_id else None)
    )
    result = await create_project_artifact(
        content=inputs.content,
        project_id=ctx.project_id,
        title=inputs.title,
        artifact_kind=inputs.artifact_kind or "ai",
        save_idempotency_key=key,
    )
    replay = bool(result.pop("idempotent_replay", False))
    return SaveProjectArtifactOutput(
        project_artifact=result,
        created=not replay,
        note=(
            "Returned existing Project Artifact (idempotent replay)."
            if replay
            else "Project Artifact saved to the active project."
        ),
    )

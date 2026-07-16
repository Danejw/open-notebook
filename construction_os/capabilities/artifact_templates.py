"""list_artifact_templates / get_artifact_template / run_artifact_template capabilities."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import require_project_session
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.services.artifact_templates import (
    execute_artifact_template,
    get_artifact_template as get_artifact_template_service,
    list_artifact_templates as list_artifact_templates_service,
)


class ListArtifactTemplatesInput(BaseModel):
    query: Optional[str] = None
    lifecycle_phase: Optional[str] = None


class ListArtifactTemplatesOutput(BaseModel):
    artifact_templates: list[dict[str, Any]] = Field(default_factory=list)


class GetArtifactTemplateInput(BaseModel):
    artifact_template_id: str


class GetArtifactTemplateOutput(BaseModel):
    artifact_template: dict[str, Any]
    note: str = (
        "Loaded for this turn only. Does not execute the template and does not "
        "persist it as a chat or session default. Use run_artifact_template to "
        "generate output."
    )


class RunArtifactTemplateInput(BaseModel):
    artifact_template_id: str
    input_text: str = Field(..., min_length=1)
    model_id: Optional[str] = None


class RunArtifactTemplateOutput(BaseModel):
    output: Optional[str] = None
    artifact_template_id: str
    model_id: Optional[str] = None
    persisted: bool = False
    defaults: dict[str, Any] = Field(default_factory=dict)
    note: str = (
        "Generation only — output was not saved as a Project Artifact. "
        "Call save_project_artifact only when the user asks to save."
    )


async def list_artifact_templates(
    ctx: CapabilityRuntimeContext,
    inputs: ListArtifactTemplatesInput | None = None,
) -> ListArtifactTemplatesOutput:
    await require_project_session(ctx)
    filters = inputs or ListArtifactTemplatesInput()
    catalog = await list_artifact_templates_service(include_prompt=False)
    out: list[dict[str, Any]] = []
    for item in catalog:
        if filters.lifecycle_phase and item.get("lifecycle_phase") != filters.lifecycle_phase:
            continue
        if filters.query:
            q = filters.query.lower()
            hay = " ".join(
                [
                    str(item.get("name") or ""),
                    str(item.get("title") or ""),
                    str(item.get("description") or ""),
                ]
            ).lower()
            if q not in hay:
                continue
        out.append(item)
    return ListArtifactTemplatesOutput(artifact_templates=out)


async def get_artifact_template(
    ctx: CapabilityRuntimeContext,
    inputs: GetArtifactTemplateInput,
) -> GetArtifactTemplateOutput:
    await require_project_session(ctx)
    template = await get_artifact_template_service(
        inputs.artifact_template_id,
        include_prompt=True,
    )
    return GetArtifactTemplateOutput(artifact_template=template)


async def run_artifact_template(
    ctx: CapabilityRuntimeContext,
    inputs: RunArtifactTemplateInput,
) -> RunArtifactTemplateOutput:
    await require_project_session(ctx)
    model_id = inputs.model_id or ctx.model_override
    result = await execute_artifact_template(
        artifact_id=inputs.artifact_template_id,
        input_text=inputs.input_text,
        model_id=model_id,
    )
    return RunArtifactTemplateOutput(
        output=result.get("output"),
        artifact_template_id=inputs.artifact_template_id,
        model_id=result.get("model_id"),
        persisted=False,
        defaults=result.get("defaults") or {},
    )

"""Shared artifact template list/get/execute helpers."""

from __future__ import annotations

from typing import Any, Optional

from construction_os.ai.models import Model
from construction_os.domain.artifact import ArtifactTemplate
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.graphs.artifact import graph as artifact_graph


def artifact_template_to_dict(
    template: ArtifactTemplate,
    *,
    include_prompt: bool = True,
) -> dict[str, Any]:
    """Canonical public shape for an artifact template."""
    data: dict[str, Any] = {
        "id": template.id or "",
        "name": template.name,
        "title": template.title,
        "description": template.description,
        "apply_default": template.apply_default,
        "lifecycle_phase": template.lifecycle_phase,
        "skill_ids": list(template.skill_ids or []),
        "collection_ids": list(template.collection_ids or []),
        "mcp_tool_ids": list(template.mcp_tool_ids or []),
        "html_template_id": template.html_template_id,
        "created": str(template.created) if template.created else "",
        "updated": str(template.updated) if template.updated else "",
    }
    if include_prompt:
        data["prompt"] = template.prompt
    return data


async def list_artifact_templates(
    *,
    include_prompt: bool = False,
) -> list[dict[str, Any]]:
    templates = await ArtifactTemplate.get_all(order_by="name asc")
    return [
        artifact_template_to_dict(t, include_prompt=include_prompt)
        for t in templates
    ]


async def get_artifact_template(
    artifact_id: str,
    *,
    include_prompt: bool = True,
) -> dict[str, Any]:
    template = await ArtifactTemplate.get(artifact_id)
    if not template:
        raise NotFoundError(f"Artifact template not found: {artifact_id}")
    return artifact_template_to_dict(template, include_prompt=include_prompt)


async def execute_artifact_template(
    *,
    artifact_id: str,
    input_text: str,
    model_id: Optional[str] = None,
) -> dict[str, Any]:
    """Run an artifact template and return output without persistence."""
    template = await ArtifactTemplate.get(artifact_id)
    if not template:
        raise NotFoundError(f"Artifact template not found: {artifact_id}")

    resolved_model_id = model_id
    if resolved_model_id:
        model = await Model.get(resolved_model_id)
        if not model:
            raise NotFoundError(f"Model not found: {resolved_model_id}")
    elif not input_text or not str(input_text).strip():
        raise InvalidInputError("input_text is required")

    result = await artifact_graph.ainvoke(
        dict(  # type: ignore[arg-type]
            input_text=input_text,
            artifact=template,
        ),
        config=dict(configurable={"model_id": resolved_model_id})
        if resolved_model_id
        else {},
    )
    return {
        "output": result.get("output"),
        "artifact_id": artifact_id,
        "model_id": resolved_model_id,
        "persisted": False,
        "defaults": {
            "skill_ids": list(template.skill_ids or []),
            "collection_ids": list(template.collection_ids or []),
            "mcp_tool_ids": list(template.mcp_tool_ids or []),
            "html_template_id": template.html_template_id,
        },
    }

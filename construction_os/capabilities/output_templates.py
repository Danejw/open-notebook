"""list_output_templates / get_output_template (HTML) capabilities."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import require_project_session
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.services.html_templates import (
    get_html_template,
    list_html_templates,
)


class ListOutputTemplatesInput(BaseModel):
    query: Optional[str] = None
    category: Optional[str] = None


class ListOutputTemplatesOutput(BaseModel):
    templates: list[dict[str, Any]] = Field(default_factory=list)


class GetOutputTemplateInput(BaseModel):
    template_id: str


class GetOutputTemplateOutput(BaseModel):
    template: dict[str, Any]
    note: str = (
        "Loaded for this turn only. Not persisted as a session HTML template "
        "default unless the user selects it in the UI."
    )


async def list_output_templates(
    ctx: CapabilityRuntimeContext,
    inputs: ListOutputTemplatesInput | None = None,
) -> ListOutputTemplatesOutput:
    await require_project_session(ctx)
    filters = inputs or ListOutputTemplatesInput()
    catalog = await list_html_templates(include_body=False)
    out: list[dict[str, Any]] = []
    for item in catalog:
        if filters.category and str(item.get("category")) != filters.category:
            continue
        if filters.query:
            q = filters.query.lower()
            hay = f"{item.get('name')} {item.get('category')}".lower()
            if q not in hay:
                continue
        out.append(item)
    return ListOutputTemplatesOutput(templates=out)


async def get_output_template(
    ctx: CapabilityRuntimeContext,
    inputs: GetOutputTemplateInput,
) -> GetOutputTemplateOutput:
    await require_project_session(ctx)
    template = await get_html_template(inputs.template_id, expand_for_chat=True)
    return GetOutputTemplateOutput(template=template)

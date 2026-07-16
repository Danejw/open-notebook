"""Shared HTML template list/get helpers (single mapper for API + capabilities)."""

from __future__ import annotations

from typing import Any

from construction_os.domain.html_document import HtmlTemplate
from construction_os.exceptions import NotFoundError
from construction_os.utils.chat_session import resolve_html_template_meta


def html_template_to_dict(
    template: HtmlTemplate,
    *,
    include_body: bool = True,
) -> dict[str, Any]:
    """Canonical public shape for an HTML template."""
    data: dict[str, Any] = {
        "id": template.id or "",
        "name": template.name,
        "category": template.category,
        "description": getattr(template, "description", None),
        "intended_output_type": template.category,
        "tags": [],
        "lifecycle_phase": None,
        "available": True,
        "created": str(template.created) if template.created else None,
        "updated": str(template.updated) if template.updated else None,
    }
    if include_body:
        data["html_body"] = template.html_body
    return data


async def list_html_templates(*, include_body: bool = False) -> list[dict[str, Any]]:
    templates = await HtmlTemplate.get_all(order_by="name asc")
    return [
        html_template_to_dict(t, include_body=include_body) for t in templates
    ]


async def get_html_template(
    template_id: str,
    *,
    expand_for_chat: bool = True,
) -> dict[str, Any]:
    template = await HtmlTemplate.get(template_id)
    if not template:
        raise NotFoundError(f"HTML template not found: {template_id}")
    data = html_template_to_dict(template, include_body=True)
    if expand_for_chat:
        resolved_id, meta = await resolve_html_template_meta(template_id)
        if meta:
            data["html_body"] = meta.get("html_body", data["html_body"])
            data["id"] = resolved_id or data["id"]
            data["rendering"] = {
                "expanded_media_tokens": True,
                "name": meta.get("name"),
                "category": meta.get("category"),
            }
    data["editable_regions"] = []
    data["structure_rules"] = (
        "Preserve template structure when filling replaceable content regions."
    )
    data["validation_constraints"] = {
        "category": template.category,
        "requires_html_body": True,
    }
    return data

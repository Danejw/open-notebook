"""list_skills / get_skill capabilities."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import require_project_session
from construction_os.capabilities.models import (
    CapabilityRuntimeContext,
    CatalogFilter,
)
from construction_os.skills.loader import (
    get_skill_catalog,
    load_one_skill_md,
    read_skill_file,
)


class ListSkillsInput(CatalogFilter):
    pass


class ListSkillsOutput(BaseModel):
    skills: list[dict[str, Any]] = Field(default_factory=list)


class GetSkillInput(BaseModel):
    skill_id: str
    relative_path: Optional[str] = None


class GetSkillOutput(BaseModel):
    skill: dict[str, Any]


def _matches_catalog_filter(item: dict[str, Any], filters: CatalogFilter) -> bool:
    if filters.status and str(item.get("status") or "") != filters.status:
        return False
    if filters.name and filters.name.lower() not in str(item.get("name") or "").lower():
        return False
    if filters.description and filters.description.lower() not in str(
        item.get("description") or ""
    ).lower():
        return False
    if filters.tags:
        tags = {str(t).lower() for t in (item.get("tags") or [])}
        wanted = {t.lower() for t in filters.tags}
        if not wanted.issubset(tags):
            return False
    if filters.query:
        q = filters.query.lower()
        hay = " ".join(
            [
                str(item.get("name") or ""),
                str(item.get("description") or ""),
                " ".join(str(t) for t in (item.get("tags") or [])),
            ]
        ).lower()
        if q not in hay:
            return False
    return True


async def list_skills(
    ctx: CapabilityRuntimeContext,
    inputs: ListSkillsInput | None = None,
) -> ListSkillsOutput:
    await require_project_session(ctx)
    catalog = await get_skill_catalog()
    filters = inputs or ListSkillsInput()
    skills = [s for s in catalog if _matches_catalog_filter(s, filters)]
    return ListSkillsOutput(skills=skills)


async def get_skill(
    ctx: CapabilityRuntimeContext,
    inputs: GetSkillInput,
) -> GetSkillOutput:
    await require_project_session(ctx)
    if inputs.relative_path:
        skill_file = await read_skill_file(inputs.skill_id, inputs.relative_path)
        return GetSkillOutput(
            skill={
                "id": inputs.skill_id,
                "path": skill_file.path,
                "encoding": skill_file.encoding,
                "content": skill_file.content,
                "disclosure": "supporting_file",
            }
        )
    loaded = await load_one_skill_md(inputs.skill_id)
    # Ephemeral turn load only — never persist to session defaults
    if inputs.skill_id not in ctx.ephemeral_skill_ids:
        ctx.ephemeral_skill_ids.append(inputs.skill_id)
    return GetSkillOutput(
        skill={
            "id": loaded["id"],
            "name": loaded["name"],
            "block": loaded["block"],
            "char_count": loaded["char_count"],
            "disclosure": "skill_md",
            "note": (
                "Loaded for this turn only. Not saved as a chat default. "
                "Use relative_path to read supporting skill files."
            ),
        }
    )

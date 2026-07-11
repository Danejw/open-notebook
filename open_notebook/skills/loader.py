"""Load skill content for chat progressive disclosure."""

from __future__ import annotations

from typing import Iterable, List, Optional

from open_notebook.domain.skill import Skill, SkillFile
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.skills.standard import REQUIRED_ENTRY, normalize_relative_path


async def get_skill_catalog() -> list[dict]:
    """Tier 1: name + description for non-archived skills."""
    skills = await Skill.get_all(order_by="name asc")
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "tags": s.tags or [],
            "status": s.status,
            "archived": s.archived,
        }
        for s in skills
        if not s.archived
    ]


async def load_skill_md_contents(skill_ids: Iterable[str]) -> str:
    """Tier 2: concatenate SKILL.md bodies for selected skills."""
    blocks: List[str] = []
    for skill_id in skill_ids:
        skill = await Skill.get(skill_id)
        if not skill or skill.archived:
            raise NotFoundError(f"Skill not found: {skill_id}")
        files = await skill.get_files()
        skill_md = next((f for f in files if f.path == REQUIRED_ENTRY), None)
        if not skill_md:
            raise InvalidInputError(f"Skill {skill.name} is missing SKILL.md")
        if skill_md.encoding != "utf-8":
            raise InvalidInputError(f"Skill {skill.name} SKILL.md is not text")
        blocks.append(
            f"## Skill: {skill.name}\n\n"
            f"**Description:** {skill.description}\n\n"
            f"{skill_md.content}"
        )
    if not blocks:
        return ""
    return (
        "# ACTIVE SKILLS\n\n"
        "The user selected these skills. Follow each SKILL.md. "
        "When a skill references other files in its package "
        "(references/, scripts/, assets/), request them via the skill file "
        "lookup using the skill id and relative path before proceeding.\n\n"
        + "\n\n---\n\n".join(blocks)
    )


async def read_skill_file(skill_id: str, relative_path: str) -> SkillFile:
    """Tier 3: read a supporting file from a skill package."""
    path = normalize_relative_path(relative_path)
    skill = await Skill.get(skill_id)
    if not skill or skill.archived:
        raise NotFoundError(f"Skill not found: {skill_id}")
    files = await skill.get_files()
    match: Optional[SkillFile] = next((f for f in files if f.path == path), None)
    if not match:
        raise NotFoundError(f"File not found in skill: {path}")
    return match

"""Skill domain models."""

from __future__ import annotations

from typing import Any, ClassVar, Dict, List, Optional, Union

from pydantic import Field, field_validator

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel


class Skill(ObjectModel):
    table_name: ClassVar[str] = "skill"
    nullable_fields: ClassVar[set[str]] = {
        "owner",
        "validation_results",
        "version",
    }

    name: str
    description: str = ""
    tags: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    visibility: str = "instance"
    status: str = "draft"
    archived: bool = False
    validation_results: Optional[Dict[str, Any]] = None
    version: Optional[str] = None

    async def get_files(self) -> List["SkillFile"]:
        if not self.id:
            return []
        result = await repo_query(
            "SELECT * FROM skill_file WHERE skill = $skill_id ORDER BY path ASC",
            {"skill_id": ensure_record_id(self.id)},
        )
        return [SkillFile(**row) for row in result]

    async def delete_files(self) -> None:
        if not self.id:
            return
        await repo_query(
            "DELETE skill_file WHERE skill = $skill_id",
            {"skill_id": ensure_record_id(self.id)},
        )

    async def delete(self) -> bool:  # type: ignore[override]
        await self.delete_files()
        return await super().delete()


class SkillFile(ObjectModel):
    table_name: ClassVar[str] = "skill_file"
    nullable_fields: ClassVar[set[str]] = set()

    skill: str
    path: str
    filename: str
    content: str
    encoding: str = "utf-8"
    mime_type: str = "text/plain"
    size_bytes: int = 0
    required: bool = False

    @field_validator("skill", mode="before")
    @classmethod
    def parse_skill_id(cls, value: Union[str, Any]) -> str:
        if value is None:
            return ""
        return str(value)

    def _prepare_save_data(self) -> dict:
        data = super()._prepare_save_data()
        if self.skill:
            data["skill"] = ensure_record_id(self.skill)
        return data

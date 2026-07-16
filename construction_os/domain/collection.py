"""Collection domain models."""

from __future__ import annotations

from typing import Any, ClassVar, Dict, List, Optional, Union

from pydantic import Field, field_validator

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.base import ObjectModel


class Collection(ObjectModel):
    table_name: ClassVar[str] = "collection"
    nullable_fields: ClassVar[set[str]] = {
        "owner",
        "validation_results",
        "version",
        "tags",
        "use_when",
        "selection",
        "manifest_extra",
        "manifest_raw",
    }

    name: str
    slug: str
    description: str = ""
    version: Optional[str] = "1.0.0"
    tags: List[str] = Field(default_factory=list)
    use_when: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    visibility: str = "instance"
    status: str = "draft"
    archived: bool = False
    selection: Optional[Dict[str, Any]] = None
    manifest_extra: Optional[Dict[str, Any]] = None
    manifest_raw: Optional[str] = None
    validation_results: Optional[Dict[str, Any]] = None

    async def get_items(self) -> List["CollectionItem"]:
        if not self.id:
            return []
        result = await repo_query(
            "SELECT * FROM collection_item WHERE collection = $collection_id ORDER BY sort_order ASC",
            {"collection_id": ensure_record_id(self.id)},
        )
        return [CollectionItem(**row) for row in result]

    async def delete_items(self) -> None:
        if not self.id:
            return
        await repo_query(
            "DELETE collection_item WHERE collection = $collection_id",
            {"collection_id": ensure_record_id(self.id)},
        )

    async def delete(self) -> bool:  # type: ignore[override]
        await self.delete_items()
        return await super().delete()


class CollectionItem(ObjectModel):
    table_name: ClassVar[str] = "collection_item"
    nullable_fields: ClassVar[set[str]] = {
        "url",
        "description",
        "tags",
        "topics",
        "authority",
        "priority",
        "metadata",
    }

    collection: str
    item_id: str
    type: str = "url"
    title: str
    url: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    authority: Optional[str] = None
    enabled: bool = True
    priority: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    sort_order: int = 0

    @field_validator("collection", mode="before")
    @classmethod
    def parse_collection_id(cls, value: Union[str, Any]) -> str:
        if value is None:
            return ""
        return str(value)

    def _prepare_save_data(self) -> dict:
        data = super()._prepare_save_data()
        if self.collection:
            data["collection"] = ensure_record_id(self.collection)
        return data

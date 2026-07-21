"""Project Artifact domain — persisted project outputs (Surreal table `note`)."""

from __future__ import annotations

from typing import Any, ClassVar, Dict, Literal, Optional

from loguru import logger
from pydantic import field_validator, model_validator
from surreal_commands import submit_command

from construction_os.domain.base import ObjectModel
from construction_os.exceptions import InvalidInputError

ArtifactKind = Literal["manual", "ai", "generated"]

# Legacy values still accepted on write / read until fully purged.
_LEGACY_TO_KIND: Dict[str, ArtifactKind] = {
    "human": "manual",
    "note": "manual",
    "manual": "manual",
    "ai": "ai",
    "artifact": "generated",
    "generated": "generated",
}

CANONICAL_KINDS: frozenset[str] = frozenset({"manual", "ai", "generated"})
AUTO_TITLE_KINDS: frozenset[str] = frozenset({"ai", "generated"})
INGESTABLE_KINDS: frozenset[str] = frozenset({"ai", "generated"})
PDF_EXPORT_KINDS: frozenset[str] = frozenset({"generated"})


def normalize_artifact_kind(value: Optional[str]) -> Optional[ArtifactKind]:
    """Map legacy or canonical kind strings to manual|ai|generated."""
    if value is None:
        return None
    mapped = _LEGACY_TO_KIND.get(value)
    if mapped is None:
        raise InvalidInputError(
            "artifact_kind must be 'manual', 'ai', or 'generated' "
            "(legacy: 'human', 'note', 'artifact' also accepted)"
        )
    return mapped


def resolve_kind_from_payload(
    *,
    artifact_kind: Optional[str] = None,
    note_type: Optional[str] = None,
    default: Optional[ArtifactKind] = "manual",
) -> Optional[ArtifactKind]:
    """Prefer artifact_kind, fall back to note_type, then default."""
    raw = artifact_kind if artifact_kind is not None else note_type
    if raw is None:
        return default
    return normalize_artifact_kind(raw)


class ProjectArtifact(ObjectModel):
    """Persisted project output. Physical table remains `note` (IDs stay `note:…`)."""

    table_name: ClassVar[str] = "note"
    nullable_fields: ClassVar[set[str]] = {"title", "note_type", "content", "save_idempotency_key"}
    title: Optional[str] = None
    # DB column name remains note_type for compatibility; values are canonical kinds.
    note_type: Optional[ArtifactKind] = None
    content: Optional[str] = None
    # Used by native save_project_artifact to prevent duplicate saves on retry.
    save_idempotency_key: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_kind_on_load(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("note_type")
        if raw is None and "artifact_kind" in data:
            raw = data.get("artifact_kind")
        if raw is not None:
            try:
                data = {**data, "note_type": normalize_artifact_kind(str(raw))}
            except InvalidInputError:
                # Leave invalid values for field validation / API layer to reject
                pass
        data.pop("artifact_kind", None)
        return data

    @field_validator("content")
    @classmethod
    def content_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise InvalidInputError("Project artifact content cannot be empty")
        return v

    @property
    def artifact_kind(self) -> Optional[ArtifactKind]:
        return self.note_type

    @artifact_kind.setter
    def artifact_kind(self, value: Optional[str]) -> None:
        self.note_type = normalize_artifact_kind(value) if value is not None else None

    async def save(self) -> Optional[str]:
        """
        Save the artifact and submit embedding command.

        Returns:
            Optional[str]: The command_id if embedding was submitted, None otherwise
        """
        await super().save()

        if self.id and self.content and self.content.strip():
            command_id = submit_command(
                "construction_os",
                "embed_note",
                {"note_id": str(self.id)},
            )
            logger.debug(
                f"Submitted embed_note command {command_id} for {self.id}"
            )
            return command_id

        return None

    async def add_to_project(self, project_id: str) -> Any:
        if not project_id:
            raise InvalidInputError("Project ID must be provided")
        relation = await self.relate("project_note", project_id)
        if self.id:
            from construction_os.services.project_memory import (
                schedule_project_memory_consolidation,
            )

            schedule_project_memory_consolidation(
                project_id=project_id,
                reason="project_artifact_saved",
                evidence_ids=[str(self.id)],
            )
        return relation

    def get_context(
        self, context_size: Literal["short", "long"] = "short"
    ) -> Dict[str, Any]:
        if context_size == "long":
            return dict(id=self.id, title=self.title, content=self.content)
        return dict(
            id=self.id,
            title=self.title,
            content=self.content[:100] if self.content else None,
        )


# Temporary alias for backward compatibility
Note = ProjectArtifact

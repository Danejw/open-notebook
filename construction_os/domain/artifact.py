from typing import ClassVar, Optional

from pydantic import Field

from construction_os.domain.base import ObjectModel, RecordModel


class Artifact(ObjectModel):
    table_name: ClassVar[str] = "artifact"
    nullable_fields: ClassVar[set[str]] = {"lifecycle_phase"}
    name: str
    title: str
    description: str
    prompt: str
    apply_default: bool
    lifecycle_phase: Optional[str] = None


class DefaultPrompts(RecordModel):
    record_id: ClassVar[str] = "construction_os:default_prompts"
    artifact_instructions: Optional[str] = Field(
        None, description="Instructions for executing an artifact"
    )

from typing import ClassVar, Optional

from pydantic import Field

from construction_os.domain.base import ObjectModel, RecordModel


class Artifact(ObjectModel):
    table_name: ClassVar[str] = "artifact"
    name: str
    title: str
    description: str
    prompt: str
    apply_default: bool


class DefaultPrompts(RecordModel):
    record_id: ClassVar[str] = "construction_os:default_prompts"
    artifact_instructions: Optional[str] = Field(
        None, description="Instructions for executing an artifact"
    )

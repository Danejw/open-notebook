"""Surreal-commands registration for asynchronous project memory consolidation."""

from typing import List, Optional

from pydantic import Field, field_validator
from surreal_commands import CommandInput, CommandOutput, command

from construction_os.services.project_memory import consolidate_project_memory


class ConsolidateProjectMemoryInput(CommandInput):
    project_id: str
    reason: str = "project_update"
    candidate_text: Optional[str] = None
    evidence_ids: List[str] = Field(default_factory=list)
    model_id: Optional[str] = None

    @field_validator("project_id")
    @classmethod
    def validate_project_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.startswith("project:") or not normalized.split(":", 1)[1]:
            raise ValueError("project_id must identify a project")
        return normalized

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("reason cannot be empty")
        return normalized[:120]


class ConsolidateProjectMemoryOutput(CommandOutput):
    success: bool
    project_id: str
    updated: bool
    revision: int = 0


@command(
    "consolidate_project_memory",
    app="construction_os",
    retry={
        "max_attempts": 4,
        "wait_strategy": "exponential_jitter",
        "wait_min": 2,
        "wait_max": 60,
        "stop_on": [ValueError],
        "retry_log_level": "debug",
    },
)
async def consolidate_project_memory_command(
    input_data: ConsolidateProjectMemoryInput,
) -> ConsolidateProjectMemoryOutput:
    snapshot, updated = await consolidate_project_memory(
        project_id=input_data.project_id,
        reason=input_data.reason,
        candidate_text=input_data.candidate_text,
        evidence_ids=input_data.evidence_ids,
        model_id=input_data.model_id,
    )
    return ConsolidateProjectMemoryOutput(
        success=True,
        project_id=input_data.project_id,
        updated=updated,
        revision=snapshot.revision if snapshot else 0,
    )

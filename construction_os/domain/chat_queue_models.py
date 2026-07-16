"""Shared persistent chat queue models, errors, and state helpers."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from typing import Any, ClassVar, Dict, List, Literal, Optional, Sequence, Tuple

from pydantic import ConfigDict, Field, field_validator, model_validator

from construction_os.database.repository import ensure_record_id
from construction_os.domain.base import ObjectModel

MAX_CHAT_QUEUE_PROMPT_LENGTH = 100_000

ChatQueueStatus = Literal["active", "paused"]
ChatQueueRunnerState = Literal["idle", "scheduled", "running"]
ChatQueueItemStatus = Literal["pending", "running", "completed", "failed", "cancelled"]
ChatQueueItemRunnerState = Literal[
    "idle", "scheduled", "running", "completed", "failed"
]

MUTABLE_ITEM_STATUSES = frozenset({"pending", "failed"})
EXECUTION_SELECTOR_FIELDS = frozenset(
    {
        "model_id",
        "skill_ids",
        "collection_ids",
        "tool_ids",
        "html_template_id",
        "artifact_id",
        "context_config",
        "forwarded_props",
    }
)


class ChatQueueError(RuntimeError):
    """Base error for queue state conflicts."""


class ChatQueueRevisionConflict(ChatQueueError):
    """Raised when a mutation uses a stale queue revision."""


class ChatQueueMutationError(ChatQueueError):
    """Raised when an item mutation violates its current state."""


class ChatQueueSessionNotFound(ChatQueueError):
    """Raised when a queue transaction finds that its session was deleted."""


@dataclass(frozen=True)
class StableItemIdentity:
    """Stable database and logical run identifiers for one enqueue request."""

    item_id: str
    run_id: str


@dataclass(frozen=True)
class PendingPositionPlan:
    """Collision-safe temporary and final positions for pending items."""

    temporary: List[int]
    final: List[int]


def _stable_digest(*parts: str) -> str:
    """Build a deterministic digest without exposing request text in record IDs."""
    value = "\0".join(parts).encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def stable_queue_id(chat_session_id: str) -> str:
    """Return the deterministic queue record ID for a chat session."""
    if not chat_session_id:
        raise ValueError("chat_session_id cannot be empty")
    return f"chat_queue:{_stable_digest(chat_session_id)}"


def stable_item_identity(
    chat_session_id: str, client_request_id: str
) -> StableItemIdentity:
    """Return stable IDs that make enqueue and uncertain recovery idempotent."""
    if not chat_session_id:
        raise ValueError("chat_session_id cannot be empty")
    if not client_request_id or not client_request_id.strip():
        raise ValueError("client_request_id cannot be empty")
    digest = _stable_digest(chat_session_id, client_request_id.strip())
    return StableItemIdentity(
        item_id=f"chat_queue_item:{digest}",
        run_id=f"chat-queue-run-{digest}",
    )


def plan_pending_positions(
    *,
    pending_count: int,
    maximum_all_position: int,
    maximum_non_pending_position: int,
) -> PendingPositionPlan:
    """Plan non-colliding two-phase positions for an exact pending reorder."""
    if pending_count < 0:
        raise ValueError("pending_count cannot be negative")
    temporary_base = maximum_all_position + 1_000_000
    final_base = maximum_non_pending_position
    return PendingPositionPlan(
        temporary=[temporary_base + index for index in range(pending_count)],
        final=[final_base + ((index + 1) * 10) for index in range(pending_count)],
    )


def validate_pending_reorder(
    *,
    requested_ids: Sequence[str],
    pending_ids: Sequence[str],
    expected_revision: int,
    current_revision: int,
) -> None:
    """Validate optimistic revision and exact pending-item membership."""
    if expected_revision != current_revision:
        raise ChatQueueRevisionConflict(
            f"Queue revision {expected_revision} is stale; current revision is "
            f"{current_revision}"
        )
    if len(requested_ids) != len(set(requested_ids)) or set(requested_ids) != set(
        pending_ids
    ):
        raise ChatQueueMutationError(
            "Reorder must contain the exact pending set without duplicates"
        )


def assert_item_mutable(status: str, *, operation: str) -> None:
    """Reject user edits/deletes after an item leaves a mutable state."""
    if status not in MUTABLE_ITEM_STATUSES:
        raise ChatQueueMutationError(
            f"Cannot {operation} a queue item with status '{status}'"
        )


def next_loop_state(
    *, current_loop: int, loop_count: int
) -> Tuple[Literal["running", "completed"], int]:
    """Return the state after one sequential loop iteration completes."""
    if loop_count < 1 or loop_count > 10:
        raise ValueError("loop_count must be between 1 and 10")
    if current_loop < 1 or current_loop > loop_count:
        raise ValueError("current_loop must be between 1 and loop_count")
    if current_loop == loop_count:
        return "completed", current_loop
    return "running", current_loop + 1


def _result_rows(result: Any) -> List[Dict[str, Any]]:
    """Normalize direct and multi-statement SurrealDB result shapes."""
    if isinstance(result, dict):
        return [result]
    if not isinstance(result, list):
        return []
    rows: List[Dict[str, Any]] = []
    for entry in result:
        if isinstance(entry, dict):
            rows.append(entry)
        if isinstance(entry, list):
            rows.extend(_result_rows(entry))
    return rows


def _first_model(result: Any, model_type):
    """Build a model from the first row matching its table prefix."""
    rows = _result_rows(result)
    table_prefix = f"{model_type.table_name}:"
    for row in rows:
        if str(row.get("id", "")).startswith(table_prefix):
            return model_type(**row)
    return None


class _ChatQueueObject(ObjectModel):
    """ObjectModel variant that persists queue record references correctly."""

    model_config = ConfigDict(validate_assignment=True)
    record_fields: ClassVar[set[str]] = set()

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        for field_name in self.record_fields:
            if data.get(field_name) is not None:
                data[field_name] = ensure_record_id(data[field_name])
        return data


class ChatQueue(_ChatQueueObject):
    """Persistent execution state for one chat session."""

    table_name: ClassVar[str] = "chat_queue"
    record_fields: ClassVar[set[str]] = {"chat_session"}
    nullable_fields: ClassVar[set[str]] = {
        "runner_command_id",
        "scheduling_token",
        "scheduling_expires_at",
        "lease_owner",
        "lease_expires_at",
    }

    chat_session: str
    status: ChatQueueStatus = "active"
    revision: int = Field(default=0, ge=0)
    next_position: int = Field(default=10, ge=0)
    runner_state: ChatQueueRunnerState = "idle"
    runner_command_id: Optional[str] = None
    scheduling_token: Optional[str] = None
    scheduling_expires_at: Optional[datetime] = None
    lease_owner: Optional[str] = None
    lease_expires_at: Optional[datetime] = None


@dataclass(frozen=True)
class RunnerFinalizationResult:
    """Outcome of an atomic pending-aware runner finalization attempt."""

    outcome: Literal["continue", "finalized", "stale"]
    queue: Optional[ChatQueue]

    @property
    def should_continue(self) -> bool:
        """Return whether the current worker must keep draining."""
        return self.outcome == "continue"

    @property
    def finalized(self) -> bool:
        """Return whether runner and lease state was cleared."""
        return self.outcome == "finalized"


class ChatQueueItem(_ChatQueueObject):
    """One immutable-at-run-time queued prompt and its stream snapshot."""

    table_name: ClassVar[str] = "chat_queue_item"
    record_fields: ClassVar[set[str]] = {"queue_id", "chat_session"}
    nullable_fields: ClassVar[set[str]] = {
        "runner_command_id",
        "stream_progress",
        "stream_activity",
        "error_type",
        "error_message",
        "error_details",
        "started_at",
        "completed_at",
        "failed_at",
        "iteration_token",
    }

    queue_id: str
    chat_session: str
    client_request_id: str
    run_id: str
    position: int = Field(ge=0)
    status: ChatQueueItemStatus = "pending"
    visible: bool = True
    prompt: str = Field(min_length=1, max_length=MAX_CHAT_QUEUE_PROMPT_LENGTH)
    loop_count: int = Field(default=1, ge=1, le=10)
    current_loop: int = Field(default=0, ge=0, le=10)
    iteration_token: Optional[str] = None
    execution_snapshot: Dict[str, Any] = Field(default_factory=dict)
    runner_command_id: Optional[str] = None
    runner_state: ChatQueueItemRunnerState = "idle"
    stream_revision: int = Field(default=0, ge=0)
    stream_content: str = ""
    stream_progress: Optional[Dict[str, Any]] = None
    stream_activity: Optional[Dict[str, Any]] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None

    @field_validator("prompt")
    @classmethod
    def trim_prompt(cls, value: str) -> str:
        """Trim prompt input and reject whitespace-only values."""
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("prompt cannot be empty")
        return trimmed

    @field_validator("client_request_id", "run_id")
    @classmethod
    def reject_blank_identifiers(cls, value: str) -> str:
        """Reject blank stable identifiers."""
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("stable identifiers cannot be empty")
        return trimmed

    @model_validator(mode="after")
    def validate_loop_progress(self) -> "ChatQueueItem":
        """Ensure persisted loop progress cannot exceed the requested count."""
        if self.current_loop > self.loop_count:
            raise ValueError("current_loop cannot exceed loop_count")
        return self

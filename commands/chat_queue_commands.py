"""Surreal-commands registration for persistent chat queue draining."""

import asyncio
from typing import Optional

from pydantic import field_validator
from surreal_commands import CommandInput, CommandOutput, command

from construction_os.chat.queue_runner import run_chat_queue_worker


class DrainChatQueueInput(CommandInput):
    """Validated identifiers for one reserved chat queue runner.

    Do not use ``from __future__ import annotations`` in this module.
    surreal-commands wraps the input schema in a RootModel that must see
    real class objects at decoration time, not postponed string annotations.
    """

    chat_session_id: str
    queue_id: str
    runner_token: str

    @field_validator("chat_session_id")
    @classmethod
    def validate_session_id(cls, value: str) -> str:
        """Require a fully qualified chat-session record ID."""
        normalized = value.strip()
        if (
            not normalized.startswith("chat_session:")
            or not normalized.split(":", 1)[1]
        ):
            raise ValueError("chat_session_id must identify a chat_session")
        return normalized

    @field_validator("queue_id")
    @classmethod
    def validate_queue_id(cls, value: str) -> str:
        """Require a fully qualified chat-queue record ID."""
        normalized = value.strip()
        if not normalized.startswith("chat_queue:") or not normalized.split(":", 1)[1]:
            raise ValueError("queue_id must identify a chat_queue")
        return normalized

    @field_validator("runner_token")
    @classmethod
    def validate_runner_token(cls, value: str) -> str:
        """Reject blank scheduling reservation tokens."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("runner_token cannot be empty")
        return normalized


class DrainChatQueueOutput(CommandOutput):
    """Successful completion metadata for a drain command."""

    success: bool
    queue_id: str
    chat_session_id: str


@command(
    "drain_chat_queue",
    app="construction_os",
    retry={
        "max_attempts": 5,
        "wait_strategy": "exponential_jitter",
        "wait_min": 1,
        "wait_max": 60,
        "stop_on": [ValueError],
        "retry_log_level": "debug",
    },
)
def drain_chat_queue_command(
    input_data: DrainChatQueueInput,
) -> DrainChatQueueOutput:
    """Run one queue drain on a fresh asyncio loop owned by this command."""
    command_id: Optional[str] = None
    if input_data.execution_context is not None:
        command_id = str(input_data.execution_context.command_id)
    asyncio.run(
        run_chat_queue_worker(
            chat_session_id=input_data.chat_session_id,
            queue_id=input_data.queue_id,
            scheduling_token=input_data.runner_token,
            command_id=command_id,
        )
    )
    return DrainChatQueueOutput(
        success=True,
        queue_id=input_data.queue_id,
        chat_session_id=input_data.chat_session_id,
    )

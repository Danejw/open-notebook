"""Persistent chat queue worker state machine and command-scoped resources."""

from __future__ import annotations

import asyncio
import hashlib
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, Literal, Optional, Protocol, cast
from uuid import uuid4

import aiosqlite
from ag_ui.core import EventType, RunAgentInput
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from loguru import logger

from construction_os.ai.models import Model
from construction_os.config import LANGGRAPH_CHECKPOINT_FILE
from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.artifact import Artifact
from construction_os.domain.chat_queue import (
    ChatQueueItem,
    ChatQueueMutationError,
    ChatQueueRepository,
)
from construction_os.domain.html_document import HtmlTemplate
from construction_os.domain.mcp import McpConnection, McpTool
from construction_os.domain.project import (
    Project,
    Source,
    get_project_scope_ids,
)
from construction_os.domain.collection import Collection
from construction_os.domain.skill import Skill
from construction_os.exceptions import NotFoundError
from construction_os.graphs import chat as chat_graph_module
from construction_os.graphs import source_chat as source_chat_module
from construction_os.graphs.ag_ui_runtime import (
    build_agent,
    build_run_input,
    iterate_agent_events,
)
from construction_os.graphs.chat_context import eligible_note_ids, eligible_source_ids
from construction_os.utils.html_media import expand_image_tokens
from construction_os.utils.text_utils import extract_text_content

QueueScope = Literal["project", "source"]
CheckpointAction = Literal["execute", "resume", "completed"]
Sleep = Callable[[float], Awaitable[None]]
EventIterator = Callable[..., Any]


class QueueRepository(Protocol):
    """Repository operations required by the queue runner."""

    async def acquire_lease(self, **kwargs): ...

    async def renew_lease(self, **kwargs): ...

    async def claim_next(self, **kwargs): ...

    async def mark_stream_progress(self, **kwargs): ...

    async def complete_loop_iteration(self, **kwargs): ...

    async def fail_item_and_pause(self, **kwargs): ...

    async def get_for_session(self, chat_session_id: str): ...

    async def finalize_runner(self, **kwargs): ...


class QueueItemValidationError(ValueError):
    """Raised when immutable queue inputs no longer resolve safely."""


class AmbiguousCheckpointError(RuntimeError):
    """Raised when checkpoint history cannot be replayed without duplication."""


class AgentRunError(RuntimeError):
    """Raised when an AG-UI stream explicitly reports RUN_ERROR."""


class ChatQueueLeaseLost(RuntimeError):
    """Raised when a worker can no longer renew its queue lease."""


class ChatQueueLeaseUnavailable(RuntimeError):
    """Raised when a command cannot acquire its scheduling-token lease."""


class CheckpointRecovery(str):
    """String-compatible replay classification with recovered final content."""

    final_content: Optional[str]

    def __new__(
        cls,
        action: CheckpointAction,
        final_content: Optional[str] = None,
    ) -> "CheckpointRecovery":
        instance = super().__new__(cls, action)
        instance.final_content = final_content
        return instance

    @property
    def action(self) -> CheckpointAction:
        """Return the replay action while preserving legacy string comparisons."""
        return cast(CheckpointAction, str(self))


@dataclass(frozen=True)
class ResolvedQueueExecution:
    """Validated graph scope and immutable AG-UI execution properties."""

    scope: QueueScope
    forwarded_props: Dict[str, Any]
    configurable: Dict[str, Any]


def stable_human_message_id(
    item_id: str, iteration: int, iteration_token: str
) -> str:
    """Return a deterministic human-message ID for one claimed iteration.

    ``iteration_token`` must change on every claim/retry so a failed attempt's
    partial checkpoint cannot block the next attempt with AmbiguousCheckpointError.
    """
    if iteration < 1:
        raise ValueError("iteration must be positive")
    if not iteration_token:
        raise ValueError("iteration_token cannot be empty")
    digest = hashlib.sha256(
        f"{item_id}\0{iteration}\0{iteration_token}".encode("utf-8")
    ).hexdigest()
    return f"chat-queue-human-{digest}"


def inspect_checkpoint_turn(
    messages: list, human_message_id: str
) -> CheckpointRecovery:
    """Classify checkpoint history for safe idempotent queue replay."""
    matching = [
        index
        for index, message in enumerate(messages)
        if getattr(message, "id", None) == human_message_id
    ]
    if not matching:
        return CheckpointRecovery("execute")
    if len(matching) != 1:
        raise AmbiguousCheckpointError(
            f"Checkpoint contains duplicate human message {human_message_id}"
        )

    index = matching[0]
    message = messages[index]
    if getattr(message, "type", None) != "human":
        raise AmbiguousCheckpointError(
            f"Checkpoint message {human_message_id} is not human"
        )
    if index == len(messages) - 1:
        return CheckpointRecovery("resume")

    pending_tool_calls: set[str] = set()
    final_content: Optional[str] = None
    for suffix_index, suffix_message in enumerate(messages[index + 1 :]):
        message_type = getattr(suffix_message, "type", None)
        if message_type == "ai":
            if final_content is not None or pending_tool_calls:
                raise AmbiguousCheckpointError(
                    f"Checkpoint after {human_message_id} has an unexpected AI message"
                )
            tool_calls = getattr(suffix_message, "tool_calls", None) or []
            if tool_calls:
                call_ids = {
                    str(call.get("id"))
                    for call in tool_calls
                    if isinstance(call, dict) and call.get("id")
                }
                if len(call_ids) != len(tool_calls):
                    raise AmbiguousCheckpointError(
                        f"Checkpoint after {human_message_id} has invalid tool calls"
                    )
                pending_tool_calls = call_ids
                continue
            if suffix_index != len(messages[index + 1 :]) - 1:
                raise AmbiguousCheckpointError(
                    f"Checkpoint after {human_message_id} has messages after its answer"
                )
            final_content = extract_text_content(suffix_message.content)
            continue
        if message_type == "tool":
            tool_call_id = str(getattr(suffix_message, "tool_call_id", ""))
            if final_content is not None or tool_call_id not in pending_tool_calls:
                raise AmbiguousCheckpointError(
                    f"Checkpoint after {human_message_id} has an unexpected tool result"
                )
            pending_tool_calls.remove(tool_call_id)
            continue
        raise AmbiguousCheckpointError(
            f"Checkpoint after {human_message_id} has an unexpected message sequence"
        )

    if pending_tool_calls or final_content is None:
        raise AmbiguousCheckpointError(
            f"Checkpoint after {human_message_id} has no terminal AI answer"
        )
    return CheckpointRecovery("completed", final_content)


async def _required_resource(loader, resource_id: str, label: str):
    """Load a selected resource or raise an item-scoped validation error."""
    try:
        resource = await loader(resource_id)
    except NotFoundError as exc:
        raise QueueItemValidationError(
            f"{label} '{resource_id}' no longer exists"
        ) from exc
    if resource is None:
        raise QueueItemValidationError(f"{label} '{resource_id}' no longer exists")
    return resource


def _snapshot_list(snapshot: Dict[str, Any], key: str) -> list[str]:
    """Normalize an optional immutable selector list."""
    value = snapshot.get(key)
    if value is None:
        return []
    if not isinstance(value, list):
        raise QueueItemValidationError(f"{key} must be a list")
    return [str(item) for item in value]


def _context_reference_ids(context_config: Dict[str, Any]) -> tuple[set[str], set[str]]:
    """Return context IDs that the project graph can actually consume."""
    source_ids = eligible_source_ids(context_config)
    note_ids = eligible_note_ids(context_config)
    for source_id in context_config.get("source_ids") or []:
        value = str(source_id)
        source_ids.add(value if value.startswith("source:") else f"source:{value}")
    for note_id in context_config.get("note_ids") or []:
        value = str(note_id)
        note_ids.add(value if value.startswith("note:") else f"note:{value}")
    return source_ids, note_ids


class QueueExecutionResolver:
    """Resolve session scope and validate an item's immutable selector snapshot."""

    async def resolve(
        self, chat_session_id: str, item: ChatQueueItem
    ) -> ResolvedQueueExecution:
        """Build the direct-SSE-equivalent forwarded payload for one item."""
        scope, target = await self._resolve_target(chat_session_id)
        snapshot = dict(item.execution_snapshot or {})
        model_id = snapshot.get("model_id")
        skill_ids = _snapshot_list(snapshot, "skill_ids")
        collection_ids = _snapshot_list(snapshot, "collection_ids")
        tool_ids = _snapshot_list(snapshot, "tool_ids")
        html_template_id = snapshot.get("html_template_id")
        artifact_id = snapshot.get("artifact_id")
        context_config = snapshot.get("context_config") or {}
        forwarded = dict(snapshot.get("forwarded_props") or {})

        if not isinstance(context_config, dict):
            raise QueueItemValidationError("context_config must be an object")
        if model_id:
            model = await _required_resource(Model.get, str(model_id), "Model")
            if getattr(model, "type", None) != "language":
                raise QueueItemValidationError(
                    f"Model '{model_id}' is not a language model"
                )
        await self._validate_skills(skill_ids)
        await self._validate_collections(collection_ids)
        await self._validate_tools(tool_ids)
        html_template = await self._resolve_template(html_template_id)

        common = {
            "model_override": model_id,
            "skill_ids": skill_ids,
            "collection_ids": collection_ids,
            "mcp_tool_ids": tool_ids,
            "strict_mcp_tools": True,
            "session_id": chat_session_id,
            "html_template_id": str(html_template_id) if html_template else None,
            "html_template": html_template,
        }
        if scope == "project":
            await self._validate_project_context(str(target.id), context_config)
            artifact = await self._resolve_artifact(artifact_id)
            forwarded.update(
                {
                    "context": forwarded.get("context"),
                    "context_config": context_config,
                    "project_id": str(target.id),
                    "project": {
                        "id": str(target.id),
                        "name": getattr(target, "name", None),
                        "description": getattr(target, "description", None),
                    },
                    **common,
                    "artifact_id": str(artifact_id) if artifact else None,
                    "artifact": artifact,
                }
            )
        else:
            if artifact_id:
                raise QueueItemValidationError(
                    "artifact_id is not supported for source chat"
                )
            source_ids, note_ids = _context_reference_ids(context_config)
            invalid_context = (source_ids - {str(target.id)}) | note_ids
            if invalid_context:
                missing = sorted(invalid_context)[0]
                raise QueueItemValidationError(
                    f"Context reference '{missing}' is invalid for source chat"
                )
            forwarded.update({"source_id": str(target.id), **common})

        return ResolvedQueueExecution(
            scope=scope,
            forwarded_props=forwarded,
            configurable={"model_id": model_id},
        )

    async def _resolve_target(self, chat_session_id: str) -> tuple[QueueScope, Any]:
        relations = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(chat_session_id)},
        )
        target_ids = {
            str(row["out"])
            for row in relations or []
            if isinstance(row, dict) and row.get("out") is not None
        }
        if len(target_ids) != 1:
            raise QueueItemValidationError(
                "Chat session must refer to exactly one project or source"
            )
        target_id = next(iter(target_ids))
        if target_id.startswith("project:"):
            return "project", await _required_resource(
                Project.get, target_id, "Project"
            )
        if target_id.startswith("source:"):
            return "source", await _required_resource(Source.get, target_id, "Source")
        raise QueueItemValidationError(
            f"Chat session target '{target_id}' is not a project or source"
        )

    async def _validate_skills(self, skill_ids: list[str]) -> None:
        for skill_id in skill_ids:
            skill = await _required_resource(Skill.get, skill_id, "Skill")
            if getattr(skill, "archived", False):
                raise QueueItemValidationError(f"Skill '{skill_id}' is archived")

    async def _validate_collections(self, collection_ids: list[str]) -> None:
        for collection_id in collection_ids:
            collection = await _required_resource(
                Collection.get, collection_id, "Collection"
            )
            if getattr(collection, "archived", False):
                raise QueueItemValidationError(
                    f"Collection '{collection_id}' is archived"
                )

    async def _validate_tools(self, tool_ids: list[str]) -> None:
        for tool_id in tool_ids:
            tool = await _required_resource(McpTool.get, tool_id, "Tool")
            if not getattr(tool, "available", True):
                raise QueueItemValidationError(f"Tool '{tool_id}' is unavailable")
            connection_id = getattr(tool, "connection", None)
            if not connection_id:
                raise QueueItemValidationError(
                    f"Tool '{tool_id}' has no referenced connection"
                )
            connection = await _required_resource(
                McpConnection.get,
                str(connection_id),
                "Tool connection",
            )
            if getattr(connection, "status", None) != "connected":
                raise QueueItemValidationError(
                    f"Tool connection '{connection_id}' is unavailable"
                )
            if getattr(tool, "risk_level", None) != "read":
                raise QueueItemValidationError(
                    f"Tool '{tool_id}' is not executable as a read-only tool"
                )

    async def _resolve_template(
        self, html_template_id: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        if not html_template_id:
            return None
        template = await _required_resource(
            HtmlTemplate.get, str(html_template_id), "HTML template"
        )
        return {
            "id": str(template.id),
            "name": template.name,
            "category": template.category,
            "html_body": await expand_image_tokens(template.html_body),
        }

    async def _resolve_artifact(
        self, artifact_id: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        if not artifact_id:
            return None
        artifact = await _required_resource(Artifact.get, str(artifact_id), "Artifact")
        return {
            "id": str(artifact.id),
            "name": artifact.name,
            "title": artifact.title,
            "description": artifact.description,
            "prompt": artifact.prompt,
        }

    async def _validate_project_context(
        self, project_id: str, context_config: Dict[str, Any]
    ) -> None:
        source_ids, note_ids = _context_reference_ids(context_config)
        if not source_ids and not note_ids:
            return
        project_sources, project_notes = await get_project_scope_ids(project_id)
        invalid = (source_ids - project_sources) | (note_ids - project_notes)
        if invalid:
            missing = sorted(invalid)[0]
            raise QueueItemValidationError(
                f"Context reference '{missing}' no longer exists in the project"
            )


@dataclass
class _StreamAccumulator:
    """Reconnectable partial stream state for one loop iteration."""

    content: str = ""
    progress: Optional[Dict[str, Any]] = None
    activity_events: list[Dict[str, Any]] = field(default_factory=list)

    @property
    def activity(self) -> Optional[Dict[str, Any]]:
        """Return persisted activity shape when any events were observed."""
        return {"events": list(self.activity_events)} if self.activity_events else None


def _event_field(event: Any, name: str, default: Any = None) -> Any:
    """Extract one raw AG-UI field from models and mappings consistently."""
    if isinstance(event, Mapping):
        return event.get(name, default)
    return getattr(event, name, default)


def _event_type(event: Any) -> str:
    value = _event_field(event, "type", "")
    return value.value if isinstance(value, Enum) else str(value)


def _event_dict(event: Any) -> Dict[str, Any]:
    if hasattr(event, "model_dump"):
        return event.model_dump(mode="json", by_alias=True)
    if isinstance(event, Mapping):
        return dict(event)
    return {"type": _event_type(event)}


class ChatQueueRunner:
    """Lease-protected state machine that drains one session queue."""

    def __init__(
        self,
        *,
        repository: QueueRepository = ChatQueueRepository,
        project_agent: Any,
        source_agent: Any,
        resolver: Optional[QueueExecutionResolver] = None,
        event_iterator: EventIterator = iterate_agent_events,
        lease_ttl_seconds: int = 60,
        lease_renew_interval_seconds: float = 20,
        snapshot_interval_seconds: float = 0.25,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        """Configure queue persistence, local agents, and worker timing."""
        if lease_ttl_seconds < 1:
            raise ValueError("lease_ttl_seconds must be positive")
        if lease_renew_interval_seconds < 0:
            raise ValueError("lease_renew_interval_seconds cannot be negative")
        if lease_renew_interval_seconds >= lease_ttl_seconds:
            raise ValueError(
                "lease_renew_interval_seconds must be shorter than lease_ttl_seconds"
            )
        if snapshot_interval_seconds < 0:
            raise ValueError("snapshot_interval_seconds cannot be negative")
        self.repository = repository
        self.project_agent = project_agent
        self.source_agent = source_agent
        self.resolver = resolver or QueueExecutionResolver()
        self.event_iterator = event_iterator
        self.lease_ttl_seconds = lease_ttl_seconds
        self.lease_renew_interval_seconds = lease_renew_interval_seconds
        self.snapshot_interval_seconds = snapshot_interval_seconds
        self.sleep = sleep
        self._lease_lost = asyncio.Event()
        self._lease_lost_cause: Optional[BaseException] = None

    async def drain(
        self,
        *,
        chat_session_id: str,
        queue_id: str,
        scheduling_token: str,
        command_id: Optional[str] = None,
    ) -> None:
        """Acquire the runner lease and drain until paused, empty, or stale."""
        owner = (
            f"chat-queue-worker:{command_id}"
            if command_id
            else f"chat-queue-worker:{uuid4().hex}"
        )
        self._lease_lost.clear()
        self._lease_lost_cause = None
        acquired = await self.repository.acquire_lease(
            queue_id=queue_id,
            owner=owner,
            scheduling_token=scheduling_token,
            ttl_seconds=self.lease_ttl_seconds,
        )
        if acquired is None:
            if await self._is_stale_command_noop(
                chat_session_id=chat_session_id,
                queue_id=queue_id,
                scheduling_token=scheduling_token,
            ):
                return
            raise ChatQueueLeaseUnavailable(
                "Queue lease could not be acquired for the scheduling token"
            )
        finalization_command_id = (
            command_id
            if command_id
            and str(getattr(acquired, "runner_command_id", "")) == command_id
            else None
        )

        stop_renewal = asyncio.Event()
        renewal_task = None
        if self.lease_renew_interval_seconds > 0:
            renewal_task = asyncio.create_task(
                self._renew_lease(queue_id, owner, stop_renewal)
            )
        try:
            while True:
                self._raise_if_lease_lost()
                item = await self.repository.claim_next(
                    queue_id=queue_id,
                    chat_session_id=chat_session_id,
                    lease_owner=owner,
                )
                if item is None:
                    outcome = await self.repository.finalize_runner(
                        queue_id=queue_id,
                        chat_session_id=chat_session_id,
                        owner=owner,
                        command_id=finalization_command_id,
                    )
                    if outcome.should_continue:
                        continue
                    return

                # Publish the claimed turn immediately so the chat UI can show
                # the human prompt before the first model tokens arrive.
                try:
                    item = await self.repository.mark_stream_progress(
                        item_id=str(item.id),
                        queue_id=queue_id,
                        chat_session_id=chat_session_id,
                        run_id=item.run_id,
                        lease_owner=owner,
                        expected_revision=item.stream_revision,
                        content=item.stream_content or "",
                        progress=item.stream_progress,
                        activity=item.stream_activity,
                    )
                except ChatQueueMutationError as seed_exc:
                    logger.warning(
                        "Chat queue item {} seed stream failed; continuing run: {}",
                        item.id,
                        seed_exc,
                    )

                completed_safely = await self._run_item_iteration(
                    item=item,
                    chat_session_id=chat_session_id,
                    queue_id=queue_id,
                    lease_owner=owner,
                )
                if not completed_safely:
                    await self.repository.finalize_runner(
                        queue_id=queue_id,
                        chat_session_id=chat_session_id,
                        owner=owner,
                        command_id=finalization_command_id,
                    )
                    return

                queue = await self.repository.get_for_session(chat_session_id)
                if queue is None or queue.status != "active":
                    await self.repository.finalize_runner(
                        queue_id=queue_id,
                        chat_session_id=chat_session_id,
                        owner=owner,
                        command_id=finalization_command_id,
                    )
                    return
        except ChatQueueLeaseLost:
            raise
        finally:
            stop_renewal.set()
            if renewal_task is not None:
                renewal_task.cancel()
                await asyncio.gather(renewal_task, return_exceptions=True)

    async def _renew_lease(
        self, queue_id: str, owner: str, stop_renewal: asyncio.Event
    ) -> None:
        try:
            while not stop_renewal.is_set():
                await self.sleep(self.lease_renew_interval_seconds)
                if stop_renewal.is_set():
                    return
                renewed = await self.repository.renew_lease(
                    queue_id=queue_id,
                    owner=owner,
                    ttl_seconds=self.lease_ttl_seconds,
                )
                if renewed is None:
                    self._lease_lost_cause = ChatQueueLeaseLost(
                        "Queue lease renewal was rejected"
                    )
                    self._lease_lost.set()
                    return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._lease_lost_cause = exc
            self._lease_lost.set()

    def _raise_if_lease_lost(self) -> None:
        if self._lease_lost.is_set():
            error = ChatQueueLeaseLost("Queue runner lease was lost")
            if self._lease_lost_cause is not None:
                raise error from self._lease_lost_cause
            raise error

    async def _is_stale_command_noop(
        self,
        *,
        chat_session_id: str,
        queue_id: str,
        scheduling_token: str,
    ) -> bool:
        """Distinguish stale command delivery from a retryable orphan reservation."""
        queue = await self.repository.get_for_session(chat_session_id)
        if queue is None:
            return True
        if (
            getattr(queue, "runner_state", None) == "idle"
            or getattr(queue, "scheduling_token", None) != scheduling_token
        ):
            return True
        lease_owner = getattr(queue, "lease_owner", None)
        lease_expires_at = getattr(queue, "lease_expires_at", None)
        if lease_owner and isinstance(lease_expires_at, datetime):
            expires_at = lease_expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > datetime.now(timezone.utc):
                return True
        items = await self.repository.list_visible_items(queue_id)
        return not any(
            getattr(item, "status", None) in {"pending", "running"} for item in items
        )

    async def _run_item_iteration(
        self,
        *,
        item: ChatQueueItem,
        chat_session_id: str,
        queue_id: str,
        lease_owner: str,
    ) -> bool:
        try:
            resolved = await self.resolver.resolve(chat_session_id, item)
            agent = (
                self.project_agent if resolved.scope == "project" else self.source_agent
            )
            message_id = stable_human_message_id(
                str(item.id),
                item.current_loop,
                item.iteration_token or "",
            )
            checkpoint = await agent.graph.aget_state(
                config={"configurable": {"thread_id": chat_session_id}}
            )
            messages = (
                list(checkpoint.values.get("messages") or [])
                if checkpoint and checkpoint.values
                else []
            )
            replay = inspect_checkpoint_turn(messages, message_id)
            if replay == "completed":
                try:
                    item = await self.repository.mark_stream_progress(
                        item_id=str(item.id),
                        queue_id=queue_id,
                        chat_session_id=chat_session_id,
                        run_id=item.run_id,
                        lease_owner=lease_owner,
                        expected_revision=item.stream_revision,
                        content=replay.final_content or "",
                        progress=item.stream_progress,
                        activity=item.stream_activity,
                    )
                except ChatQueueMutationError as seed_exc:
                    logger.warning(
                        "Chat queue item {} completed-replay stream failed; continuing: {}",
                        item.id,
                        seed_exc,
                    )
            else:
                run_input = build_run_input(
                    thread_id=chat_session_id,
                    message=item.prompt,
                    message_id=message_id,
                    forwarded_props=resolved.forwarded_props,
                )
                item = await self._consume_events(
                    agent=agent,
                    run_input=run_input,
                    configurable=resolved.configurable,
                    item=item,
                    queue_id=queue_id,
                    chat_session_id=chat_session_id,
                    lease_owner=lease_owner,
                )
            self._raise_if_lease_lost()
            await self.repository.complete_loop_iteration(
                item_id=str(item.id),
                queue_id=queue_id,
                chat_session_id=chat_session_id,
                run_id=item.run_id,
                lease_owner=lease_owner,
                expected_loop=item.current_loop,
                iteration_token=item.iteration_token,
            )
            return True
        except ChatQueueLeaseLost:
            raise
        except Exception as exc:
            logger.warning(
                "Chat queue item {} failed during iteration {}: {}",
                item.id,
                item.current_loop,
                exc,
            )
            try:
                await self.repository.fail_item_and_pause(
                    item_id=str(item.id),
                    queue_id=queue_id,
                    chat_session_id=chat_session_id,
                    run_id=item.run_id,
                    lease_owner=lease_owner,
                    error_type=type(exc).__name__,
                    error_message=str(exc),
                    error_details={"iteration": item.current_loop},
                )
            except ChatQueueMutationError:
                self._raise_if_lease_lost()
                raise
            return False

    async def _consume_events(
        self,
        *,
        agent: Any,
        run_input: RunAgentInput,
        configurable: Dict[str, Any],
        item: ChatQueueItem,
        queue_id: str,
        chat_session_id: str,
        lease_owner: str,
    ) -> ChatQueueItem:
        accumulator = _StreamAccumulator()
        last_flush = time.monotonic()
        run_error: Optional[AgentRunError] = None
        async for event in self._events_until_lease_loss(
            agent, run_input, configurable
        ):
            self._raise_if_lease_lost()
            event_type = _event_type(event)
            if event_type in {
                EventType.TEXT_MESSAGE_CONTENT.value,
                EventType.TEXT_MESSAGE_CHUNK.value,
            }:
                delta = _event_field(event, "delta")
                if isinstance(delta, str):
                    accumulator.content += delta
            elif (
                event_type == EventType.CUSTOM.value
                and _event_field(event, "name") == "agent_progress"
                and isinstance(_event_field(event, "value"), dict)
            ):
                value = _event_field(event, "value")
                accumulator.progress = dict(value)
                accumulator.activity_events.append(dict(value))
            elif event_type == EventType.RUN_ERROR.value:
                run_error = AgentRunError(
                    str(_event_field(event, "message") or "Agent run failed")
                )
                break
            elif event_type in {
                EventType.CUSTOM.value,
                EventType.STEP_STARTED.value,
                EventType.STEP_FINISHED.value,
                EventType.TOOL_CALL_START.value,
                EventType.TOOL_CALL_ARGS.value,
                EventType.TOOL_CALL_END.value,
                EventType.TOOL_CALL_RESULT.value,
            }:
                accumulator.activity_events.append(_event_dict(event))

            if time.monotonic() - last_flush >= self.snapshot_interval_seconds:
                item = await self._flush_stream(
                    item=item,
                    accumulator=accumulator,
                    queue_id=queue_id,
                    chat_session_id=chat_session_id,
                    lease_owner=lease_owner,
                )
                last_flush = time.monotonic()

        self._raise_if_lease_lost()
        item = await self._flush_stream(
            item=item,
            accumulator=accumulator,
            queue_id=queue_id,
            chat_session_id=chat_session_id,
            lease_owner=lease_owner,
        )
        if run_error is not None:
            raise run_error
        return item

    async def _events_until_lease_loss(
        self,
        agent: Any,
        run_input: RunAgentInput,
        configurable: Dict[str, Any],
    ):
        """Yield events while concurrently detecting renewal loss."""
        events = self.event_iterator(
            agent, run_input, configurable=configurable
        ).__aiter__()
        while True:
            next_event = asyncio.ensure_future(anext(events))
            lease_lost = asyncio.create_task(self._lease_lost.wait())
            done, pending = await asyncio.wait(
                {next_event, lease_lost},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            if lease_lost in done and lease_lost.result():
                if hasattr(events, "aclose"):
                    await events.aclose()
                self._raise_if_lease_lost()
            if lease_lost not in done:
                lease_lost.cancel()
                await asyncio.gather(lease_lost, return_exceptions=True)
            try:
                yield next_event.result()
            except StopAsyncIteration:
                return

    async def _flush_stream(
        self,
        *,
        item: ChatQueueItem,
        accumulator: _StreamAccumulator,
        queue_id: str,
        chat_session_id: str,
        lease_owner: str,
    ) -> ChatQueueItem:
        """Persist reconnectable stream bytes without failing the agent turn.

        Stream snapshot CAS can race with lease renewals or UI polling. The
        AG-UI run itself is authoritative; dropping a snapshot must not pause
        the queue or skip the chat API completion.
        """
        try:
            return await self.repository.mark_stream_progress(
                item_id=str(item.id),
                queue_id=queue_id,
                chat_session_id=chat_session_id,
                run_id=item.run_id,
                lease_owner=lease_owner,
                expected_revision=item.stream_revision,
                content=accumulator.content,
                progress=accumulator.progress,
                activity=accumulator.activity,
            )
        except ChatQueueMutationError as flush_exc:
            logger.warning(
                "Chat queue item {} stream flush failed; continuing run: {}",
                item.id,
                flush_exc,
            )
            return item


async def _configure_worker_connection(connection: aiosqlite.Connection) -> None:
    """Apply safe SQLite concurrency settings for a command-owned connection."""
    await connection.execute("PRAGMA busy_timeout=5000")
    try:
        await connection.execute("PRAGMA journal_mode=WAL")
    except aiosqlite.OperationalError as exc:
        logger.debug("SQLite WAL mode unavailable for queue worker: {}", exc)
    await connection.commit()


async def run_chat_queue_worker(
    *,
    chat_session_id: str,
    queue_id: str,
    scheduling_token: str,
    command_id: Optional[str] = None,
) -> None:
    """Run one drain command with an event-loop-local SQLite checkpointer."""
    connection = await aiosqlite.connect(LANGGRAPH_CHECKPOINT_FILE)
    try:
        connection.row_factory = aiosqlite.Row
        await _configure_worker_connection(connection)
        checkpointer = AsyncSqliteSaver(connection)
        await checkpointer.setup()
        project_graph = chat_graph_module.compile_graph(checkpointer)
        source_graph = source_chat_module.compile_graph(checkpointer)
        runner = ChatQueueRunner(
            project_agent=build_agent("project_chat_worker", project_graph),
            source_agent=build_agent("source_chat_worker", source_graph),
        )
        await runner.drain(
            chat_session_id=chat_session_id,
            queue_id=queue_id,
            scheduling_token=scheduling_token,
            command_id=command_id,
        )
    finally:
        await connection.close()

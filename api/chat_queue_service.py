"""Authorization and orchestration boundary for persistent chat queues."""

from __future__ import annotations

import asyncio
import inspect
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, Optional, Type, Union
from uuid import uuid4

from loguru import logger
from surreal_commands import submit_command
from surrealdb import RecordID

from api.models import (
    ChatQueueItemEnqueueRequest,
    ChatQueueItemResponse,
    ChatQueueItemUpdateRequest,
    ChatQueueReorderRequest,
    ChatQueueResponse,
    ChatQueueStreamResponse,
)
from construction_os.domain.chat_queue import (
    ChatQueue,
    ChatQueueItem,
    ChatQueueMutationError,
    ChatQueueRepository,
    ChatQueueRevisionConflict,
    ChatQueueSessionNotFound,
)
from construction_os.domain.project import ChatSession
from construction_os.exceptions import NotFoundError

CommandIdentifier = Union[str, RecordID]
CommandResult = Union[CommandIdentifier, Awaitable[CommandIdentifier]]
CommandSubmitter = Callable[[str, str, Dict[str, Any]], CommandResult]
DisconnectProbe = Callable[[], Awaitable[bool]]


class ChatQueueServiceError(RuntimeError):
    """Base error raised by the chat queue API service."""


class ChatQueueNotFoundError(ChatQueueServiceError):
    """Raised when a session, queue, or queue item cannot be found."""


class ChatQueueForbiddenError(ChatQueueServiceError):
    """Raised when a guest session attempts to use the private queue."""


class ChatQueueConflictError(ChatQueueServiceError):
    """Raised when persisted queue state rejects a requested mutation."""


class ChatQueueValidationError(ChatQueueServiceError):
    """Raised when a queue operation receives invalid domain input."""


class ChatQueueSubmissionError(ChatQueueServiceError):
    """Raised when a reserved queue runner cannot be submitted."""

    def __init__(self, message: str, *, uncertain: bool = False) -> None:
        super().__init__(message)
        self.uncertain = uncertain


def normalize_chat_session_id(session_id: str) -> str:
    """Normalize a bare session identifier to its SurrealDB record ID."""
    normalized = session_id.strip()
    if not normalized:
        raise ChatQueueValidationError("Session ID cannot be empty")
    if normalized.startswith("chat_session:"):
        return normalized
    if ":" in normalized:
        raise ChatQueueValidationError("Session ID must identify a chat_session")
    return f"chat_session:{normalized}"


def normalize_chat_queue_item_id(item_id: str) -> str:
    """Normalize a bare queue item identifier to its SurrealDB record ID."""
    normalized = item_id.strip()
    if not normalized:
        raise ChatQueueValidationError("Queue item ID cannot be empty")
    if normalized.startswith("chat_queue_item:"):
        return normalized
    if ":" in normalized:
        raise ChatQueueValidationError("Queue item ID must identify a chat_queue_item")
    return f"chat_queue_item:{normalized}"


def resolve_stream_after_revision(
    after_revision: Optional[int],
    last_event_id: Optional[str],
) -> int:
    """Resolve an SSE cursor with query, header, then zero precedence."""
    if after_revision is not None:
        if after_revision < 0:
            raise ChatQueueValidationError("after_revision cannot be negative")
        return after_revision
    if last_event_id is None:
        return 0
    value = last_event_id.strip()
    if not value:
        raise ChatQueueValidationError("Last-Event-ID must be a nonnegative integer")
    try:
        revision = int(value)
    except ValueError as exc:
        raise ChatQueueValidationError(
            "Last-Event-ID must be a nonnegative integer"
        ) from exc
    if revision < 0:
        raise ChatQueueValidationError("Last-Event-ID must be a nonnegative integer")
    return revision


class ChatQueueService:
    """Authorize sessions and coordinate persistent queue repository operations."""

    def __init__(
        self,
        *,
        repository: Type[ChatQueueRepository] = ChatQueueRepository,
        command_submitter: CommandSubmitter = submit_command,
        poll_interval_seconds: float = 0.5,
        heartbeat_interval_seconds: float = 15.0,
        scheduling_reservation_ttl_seconds: int = 30,
    ) -> None:
        """Configure persistence, command submission, and SSE timing."""
        if poll_interval_seconds < 0:
            raise ValueError("poll_interval_seconds cannot be negative")
        if heartbeat_interval_seconds < 0:
            raise ValueError("heartbeat_interval_seconds cannot be negative")
        if scheduling_reservation_ttl_seconds < 1:
            raise ValueError("scheduling_reservation_ttl_seconds must be positive")
        self.repository = repository
        self.command_submitter = command_submitter
        self.poll_interval_seconds = poll_interval_seconds
        self.heartbeat_interval_seconds = heartbeat_interval_seconds
        self.scheduling_reservation_ttl_seconds = scheduling_reservation_ttl_seconds

    async def get_queue(self, session_id: str) -> ChatQueueResponse:
        """Return the authorized session's persisted queue snapshot.

        Only recovers orphaned running items. Pending work is scheduled by
        enqueue(schedule_runner=True), resume, retry, or the client handoff
        after a live turn — never by a read, which would race live chat.
        """
        chat_session_id = await self._authorize_session(session_id)
        queue = await self._get_or_create_queue(chat_session_id)
        try:
            queue = await self._ensure_runner(queue, allow_pending=False)
        except ChatQueueSubmissionError as exc:
            if exc.uncertain:
                logger.warning(
                    "Chat queue {} has an uncertain runner reservation: {}",
                    queue.id,
                    exc,
                )
            else:
                logger.warning(
                    "Chat queue {} runner recovery failed: {}",
                    queue.id,
                    exc,
                )
        return await self._snapshot(queue)

    async def enqueue(
        self,
        session_id: str,
        request: ChatQueueItemEnqueueRequest,
    ) -> ChatQueueItemResponse:
        """Persist an immutable request snapshot and ensure one active runner."""
        chat_session_id, session = await self._authorize_session_record(session_id)
        snapshot = request.to_execution_snapshot(
            default_model_id=session.model_override,
            default_skill_ids=session.skill_ids,
            default_html_template_id=session.html_template_id,
        ).model_copy(deep=True)
        try:
            item = await self.repository.enqueue(
                chat_session_id=chat_session_id,
                client_request_id=request.client_request_id,
                prompt=request.prompt,
                loop_count=request.loop_count,
                execution_snapshot=snapshot.model_dump(mode="python"),
            )
        except ChatQueueSessionNotFound as exc:
            raise ChatQueueNotFoundError("Session not found") from exc
        except ValueError as exc:
            raise ChatQueueValidationError(str(exc)) from exc
        queue = await self._get_or_create_queue(chat_session_id)
        # New and deferred enqueues stay in auto-play (active). Never leave a
        # freshly written prompt trapped under paused unless the user paused.
        # schedule_runner=false only skips drain while a live turn owns chat.
        if request.schedule_runner:
            try:
                await self._ensure_runner(queue)
            except ChatQueueSubmissionError as exc:
                # The item is durable. Only fail the request when duplicate
                # execution is possible (uncertain OSError / timeout path).
                if exc.uncertain:
                    raise
                logger.warning(
                    "Chat queue item {} saved but runner scheduling failed: {}",
                    item.id,
                    exc,
                )
        return self._item_response(item)

    async def update_queue(
        self,
        session_id: str,
        status: str,
    ) -> ChatQueueResponse:
        """Pause future claims or resume the queue and ensure a runner."""
        chat_session_id = await self._authorize_session(session_id)
        queue = await self._get_or_create_queue(chat_session_id)
        try:
            if status == "paused":
                queue = await self.repository.pause(str(queue.id))
            elif status == "active":
                queue = await self.repository.resume(str(queue.id))
                queue = await self._prepare_resume_frontier(queue)
                queue = await self._ensure_runner(queue, force_reschedule=True)
            else:
                raise ChatQueueValidationError(
                    "Queue status must be 'active' or 'paused'"
                )
        except ChatQueueMutationError as exc:
            raise ChatQueueConflictError(str(exc)) from exc
        return await self._snapshot(queue)

    async def update_item(
        self,
        session_id: str,
        item_id: str,
        request: ChatQueueItemUpdateRequest,
    ) -> ChatQueueItemResponse:
        """Update mutable fields on an owned pending or failed queue item."""
        chat_session_id, queue, item_record_id = await self._owned_item(
            session_id, item_id
        )
        fields = request.model_fields_set
        try:
            item = await self.repository.update_item(
                item_record_id,
                queue_id=str(queue.id),
                chat_session_id=chat_session_id,
                prompt=request.prompt if "prompt" in fields else None,
                loop_count=request.loop_count if "loop_count" in fields else None,
                selector_patch=request.selector_patch(),
            )
        except (ChatQueueMutationError, ChatQueueRevisionConflict) as exc:
            raise ChatQueueConflictError(str(exc)) from exc
        except ValueError as exc:
            raise ChatQueueValidationError(str(exc)) from exc
        return self._item_response(item)

    async def delete_item(self, session_id: str, item_id: str) -> None:
        """Delete an owned pending or failed queue item."""
        chat_session_id, queue, item_record_id = await self._owned_item(
            session_id, item_id
        )
        try:
            await self.repository.delete_item(
                item_record_id,
                queue_id=str(queue.id),
                chat_session_id=chat_session_id,
            )
        except ChatQueueMutationError as exc:
            raise ChatQueueConflictError(str(exc)) from exc

    async def reorder(
        self,
        session_id: str,
        request: ChatQueueReorderRequest,
    ) -> ChatQueueResponse:
        """Atomically reorder the exact pending set at an expected revision."""
        chat_session_id = await self._authorize_session(session_id)
        queue = await self._queue_for_session(chat_session_id)
        item_ids = [
            normalize_chat_queue_item_id(item_id) for item_id in request.item_ids
        ]
        try:
            queue = await self.repository.reorder_pending(
                str(queue.id),
                chat_session_id=chat_session_id,
                item_ids=item_ids,
                expected_revision=request.expected_revision,
            )
        except (ChatQueueMutationError, ChatQueueRevisionConflict) as exc:
            raise ChatQueueConflictError(str(exc)) from exc
        except ValueError as exc:
            raise ChatQueueValidationError(str(exc)) from exc
        return await self._snapshot(queue)

    async def retry_item(
        self,
        session_id: str,
        item_id: str,
    ) -> ChatQueueItemResponse:
        """Reset an owned failed item and ensure an active queue runner."""
        chat_session_id, queue, item_record_id = await self._owned_item(
            session_id, item_id
        )
        try:
            item = await self.repository.retry_failed(
                item_id=item_record_id,
                queue_id=str(queue.id),
                chat_session_id=chat_session_id,
            )
            if queue.status == "paused":
                queue = await self.repository.resume(str(queue.id))
            else:
                latest = await self.repository.get_for_session(chat_session_id)
                if latest is not None:
                    queue = latest
        except ChatQueueMutationError as exc:
            raise ChatQueueConflictError(str(exc)) from exc
        await self._ensure_runner(queue, force_reschedule=True)
        return self._item_response(item)

    async def stream_events(
        self,
        session_id: str,
        *,
        after_revision: Optional[int],
        is_disconnected: DisconnectProbe,
    ) -> AsyncGenerator[ChatQueueStreamResponse, None]:
        """Stream persisted queue changes and heartbeats without execution effects."""
        if after_revision is not None and after_revision < 0:
            raise ChatQueueValidationError("after_revision cannot be negative")
        chat_session_id = await self._authorize_session(session_id)
        queue = await self._get_or_create_queue(chat_session_id)
        cursor = 0 if after_revision is None else after_revision
        if after_revision is None or cursor == 0 or queue.revision > cursor:
            snapshot = await self._snapshot(queue)
            cursor = self._snapshot_revision(snapshot)
            yield ChatQueueStreamResponse(
                event="snapshot",
                revision=cursor,
                queue=snapshot,
            )

        last_event_at = time.monotonic()
        while not await is_disconnected():
            emitted_change = False
            newer_queue, newer_items = await self.repository.list_revision_changes(
                queue_id=str(queue.id),
                chat_session_id=chat_session_id,
                after_revision=cursor,
            )
            if newer_queue is not None:
                queue_event = await self._snapshot(newer_queue)
                cursor = max(cursor, newer_queue.revision)
                yield ChatQueueStreamResponse(
                    event="queue",
                    revision=newer_queue.revision,
                    queue=queue_event,
                )
                emitted_change = True
                last_event_at = time.monotonic()
                newer_items = [
                    item
                    for item in newer_items
                    if item.stream_revision == newer_queue.revision
                ]
            for item in sorted(
                newer_items, key=lambda changed_item: changed_item.stream_revision
            ):
                cursor = max(cursor, item.stream_revision)
                yield ChatQueueStreamResponse(
                    event="item",
                    revision=item.stream_revision,
                    item=self._item_response(item),
                )
                emitted_change = True
                last_event_at = time.monotonic()

            await asyncio.sleep(self.poll_interval_seconds)
            now = time.monotonic()
            if (
                not emitted_change
                and now - last_event_at >= self.heartbeat_interval_seconds
            ):
                yield ChatQueueStreamResponse(
                    event="heartbeat",
                    revision=cursor,
                )
                last_event_at = now

    async def delete_session(self, session_id: str) -> None:
        """Atomically reject running work or delete session and queue state."""
        chat_session_id = normalize_chat_session_id(session_id)
        try:
            deleted = await self.repository.delete_session_if_idle(chat_session_id)
        except ChatQueueMutationError as exc:
            raise ChatQueueConflictError(
                "Cannot delete a chat session while a queue item is running"
            ) from exc
        if not deleted:
            raise ChatQueueNotFoundError("Session not found")

    async def _authorize_session(self, session_id: str) -> str:
        chat_session_id, _session = await self._authorize_session_record(session_id)
        return chat_session_id

    async def _authorize_session_record(
        self, session_id: str
    ) -> tuple[str, ChatSession]:
        """Return the normalized authorized session ID and its current defaults."""
        chat_session_id = normalize_chat_session_id(session_id)
        try:
            session = await ChatSession.get(chat_session_id)
        except NotFoundError as exc:
            raise ChatQueueNotFoundError("Session not found") from exc
        if session is None:
            raise ChatQueueNotFoundError("Session not found")
        guest_key = getattr(session, "guest_key", None)
        if isinstance(guest_key, str) and guest_key.strip():
            raise ChatQueueForbiddenError(
                "Persistent queues are unavailable for guest sessions"
            )
        return chat_session_id, session

    async def _queue_for_session(self, chat_session_id: str) -> ChatQueue:
        queue = await self.repository.get_for_session(chat_session_id)
        if queue is None:
            raise ChatQueueNotFoundError("Queue not found")
        return queue

    async def _get_or_create_queue(self, chat_session_id: str) -> ChatQueue:
        try:
            return await self.repository.get_or_create(chat_session_id)
        except ChatQueueSessionNotFound as exc:
            raise ChatQueueNotFoundError("Session not found") from exc

    async def _owned_item(
        self,
        session_id: str,
        item_id: str,
    ) -> tuple[str, ChatQueue, str]:
        chat_session_id = await self._authorize_session(session_id)
        queue = await self._queue_for_session(chat_session_id)
        item_record_id = normalize_chat_queue_item_id(item_id)
        item = await self.repository.get_item_for_session(
            item_record_id,
            queue_id=str(queue.id),
            chat_session_id=chat_session_id,
        )
        if item is None:
            raise ChatQueueNotFoundError("Queue item not found")
        return chat_session_id, queue, item_record_id

    async def _prepare_resume_frontier(self, queue: ChatQueue) -> ChatQueue:
        """On resume, retry the top failed item when it blocks the FIFO frontier."""
        items = await self.repository.list_visible_items(str(queue.id))
        if any(item.status == "running" for item in items):
            return queue
        frontier = sorted(
            (
                item
                for item in items
                if item.status in {"pending", "failed"}
            ),
            key=lambda item: (item.position, str(item.id)),
        )
        if not frontier or frontier[0].status != "failed":
            return queue
        top = frontier[0]
        await self.repository.retry_failed(
            item_id=str(top.id),
            queue_id=str(queue.id),
            chat_session_id=str(queue.chat_session),
        )
        latest = await self.repository.get_for_session(str(queue.chat_session))
        return latest or queue

    @staticmethod
    def _lease_is_live(queue: ChatQueue) -> bool:
        """True when a worker still holds a non-expired drain lease."""
        lease_owner = getattr(queue, "lease_owner", None)
        lease_expires_at = getattr(queue, "lease_expires_at", None)
        if not lease_owner or not isinstance(lease_expires_at, datetime):
            return False
        expires_at = lease_expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return expires_at > datetime.now(timezone.utc)

    async def _ensure_runner(
        self,
        queue: ChatQueue,
        *,
        force_reschedule: bool = False,
        allow_pending: bool = True,
    ) -> ChatQueue:
        if queue.status != "active":
            return queue
        items = await self.repository.list_visible_items(str(queue.id))
        # Orphaned running items need adoption even when the queue paused mid-loop.
        has_running = any(item.status == "running" for item in items)
        pending_items = [item for item in items if item.status == "pending"]
        # An in-flight drain already owns the session. Do not schedule a
        # competing command that clears the lease mid-turn (GET/enqueue races).
        if (
            has_running
            and self._lease_is_live(queue)
            and getattr(queue, "runner_state", None) == "running"
        ):
            return queue
        if not has_running:
            if not allow_pending or not pending_items:
                return queue

        if force_reschedule and not has_running:
            cleared = await self.repository.clear_unleased_schedule(
                queue_id=str(queue.id),
                chat_session_id=str(queue.chat_session),
            )
            if cleared is not None:
                queue = cleared

        reservation_id = f"chat-queue-schedule-{uuid4().hex}"
        try:
            queue = await self.repository.reserve_runner(
                queue_id=str(queue.id),
                chat_session_id=str(queue.chat_session),
                scheduling_token=reservation_id,
                ttl_seconds=self.scheduling_reservation_ttl_seconds,
            )
        except ChatQueueMutationError:
            latest = await self.repository.get_for_session(str(queue.chat_session))
            return latest or queue

        command_args = {
            "chat_session_id": str(queue.chat_session),
            "queue_id": str(queue.id),
            "runner_token": reservation_id,
        }
        try:
            submitted = self.command_submitter(
                "construction_os",
                "drain_chat_queue",
                command_args,
            )
            command_id = (
                await submitted if inspect.isawaitable(submitted) else submitted
            )
            if not command_id:
                raise RuntimeError("Command submission returned no command ID")
        except OSError as exc:
            raise ChatQueueSubmissionError(
                "Queue item was saved, but runner submission is uncertain; "
                "the reservation was retained to prevent duplicate execution",
                uncertain=True,
            ) from exc
        except Exception as exc:
            await self.repository.reset_runner_reservation(
                queue_id=str(queue.id),
                chat_session_id=str(queue.chat_session),
                scheduling_token=reservation_id,
            )
            raise ChatQueueSubmissionError(
                "Queue item was saved, but its runner could not be scheduled"
            ) from exc

        confirmed = await self.repository.confirm_runner_command(
            queue_id=str(queue.id),
            chat_session_id=str(queue.chat_session),
            scheduling_token=reservation_id,
            command_id=str(command_id),
        )
        if confirmed is not None:
            return confirmed
        latest = await self.repository.get_for_session(str(queue.chat_session))
        return latest or queue

    async def _snapshot(self, queue: ChatQueue) -> ChatQueueResponse:
        items = await self.repository.list_visible_items(str(queue.id))
        current_item = next(
            (item for item in items if item.status == "running"),
            None,
        )
        queue_data = self._timezone_aware_dump(queue.model_dump(mode="python"))
        return ChatQueueResponse(
            **queue_data,
            items=[self._item_response(item) for item in items],
            current_item=self._item_response(current_item) if current_item else None,
        )

    @staticmethod
    def _timezone_aware_dump(data: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure datetime fields carry UTC so clients can parse offsets."""
        for field_name in (
            "started_at",
            "completed_at",
            "failed_at",
            "lease_expires_at",
            "scheduling_expires_at",
            "created",
            "updated",
        ):
            value = data.get(field_name)
            if isinstance(value, datetime) and value.tzinfo is None:
                data[field_name] = value.replace(tzinfo=timezone.utc)
        return data

    @classmethod
    def _item_response(cls, item: ChatQueueItem) -> ChatQueueItemResponse:
        """Serialize one queue item with timezone-aware timestamps for clients."""
        return ChatQueueItemResponse.model_validate(
            cls._timezone_aware_dump(item.model_dump(mode="python"))
        )

    @staticmethod
    def _snapshot_revision(snapshot: ChatQueueResponse) -> int:
        return snapshot.revision


chat_queue_service = ChatQueueService()

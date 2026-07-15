"""Persistent per-session chat queue models and atomic repository operations."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple
from uuid import uuid4

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.chat_queue_models import (
    EXECUTION_SELECTOR_FIELDS,
    MAX_CHAT_QUEUE_PROMPT_LENGTH,
    MUTABLE_ITEM_STATUSES,
    ChatQueue,
    ChatQueueError,
    ChatQueueItem,
    ChatQueueItemRunnerState,
    ChatQueueItemStatus,
    ChatQueueMutationError,
    ChatQueueRevisionConflict,
    ChatQueueRunnerState,
    ChatQueueSessionNotFound,
    ChatQueueStatus,
    PendingPositionPlan,
    RunnerFinalizationResult,
    StableItemIdentity,
    _first_model,
    _result_rows,
    assert_item_mutable,
    next_loop_state,
    plan_pending_positions,
    stable_item_identity,
    stable_queue_id,
    validate_pending_reorder,
)

__all__ = [
    "EXECUTION_SELECTOR_FIELDS",
    "MAX_CHAT_QUEUE_PROMPT_LENGTH",
    "MUTABLE_ITEM_STATUSES",
    "ChatQueue",
    "ChatQueueError",
    "ChatQueueItem",
    "ChatQueueItemRunnerState",
    "ChatQueueItemStatus",
    "ChatQueueMutationError",
    "ChatQueueRepository",
    "ChatQueueRevisionConflict",
    "ChatQueueRunnerState",
    "ChatQueueSessionNotFound",
    "ChatQueueStatus",
    "PendingPositionPlan",
    "RunnerFinalizationResult",
    "StableItemIdentity",
    "assert_item_mutable",
    "next_loop_state",
    "plan_pending_positions",
    "stable_item_identity",
    "stable_queue_id",
    "validate_pending_reorder",
]


class ChatQueueRepository:
    """Atomic persistence operations for per-session chat queues."""

    @staticmethod
    async def get_or_create(chat_session_id: str) -> ChatQueue:
        """Get the deterministic queue for a session, creating it if absent."""
        queue_id = stable_queue_id(chat_session_id)
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $chat_session_row = (SELECT * FROM $chat_session)[0];
            IF $chat_session_row = NONE {
                RETURN { outcome: 'session_missing' };
            } ELSE {
                LET $existing = (SELECT * FROM $queue_id)[0];
                IF $existing = NONE {
                    CREATE ONLY $queue_id CONTENT {
                        chat_session: $chat_session,
                        status: 'active',
                        revision: 0,
                        next_position: 10,
                        runner_state: 'idle',
                        created: time::now(),
                        updated: time::now()
                    };
                } ELSE {
                    RETURN $existing;
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
            },
        )
        if any(row.get("outcome") == "session_missing" for row in _result_rows(result)):
            raise ChatQueueSessionNotFound("Chat session no longer exists")
        queue = _first_model(result, ChatQueue)
        if queue is None:
            rows = await repo_query(
                "SELECT * FROM $queue_id", {"queue_id": ensure_record_id(queue_id)}
            )
            queue = _first_model(rows, ChatQueue)
        if queue is None:
            raise ChatQueueError("Failed to get or create chat queue")
        return queue

    @staticmethod
    async def get_for_session(chat_session_id: str) -> Optional[ChatQueue]:
        """Return the queue owned by a chat session, if one exists."""
        result = await repo_query(
            "SELECT * FROM chat_queue WHERE chat_session = $chat_session LIMIT 1",
            {"chat_session": ensure_record_id(chat_session_id)},
        )
        return _first_model(result, ChatQueue)

    @staticmethod
    async def list_visible_items(queue_id: str) -> List[ChatQueueItem]:
        """List user-visible items in exact persisted order."""
        result = await repo_query(
            """
            SELECT * FROM chat_queue_item
            WHERE queue_id = $queue_id AND visible = true
            ORDER BY position ASC
            """,
            {"queue_id": ensure_record_id(queue_id)},
        )
        return [ChatQueueItem(**row) for row in _result_rows(result)]

    @staticmethod
    async def get_current_item(queue_id: str) -> Optional[ChatQueueItem]:
        """Return the active running item for a queue."""
        result = await repo_query(
            """
            SELECT * FROM chat_queue_item
            WHERE queue_id = $queue_id AND status = 'running'
            ORDER BY position ASC LIMIT 1
            """,
            {"queue_id": ensure_record_id(queue_id)},
        )
        return _first_model(result, ChatQueueItem)

    @staticmethod
    async def get_item_for_session(
        item_id: str,
        *,
        queue_id: str,
        chat_session_id: str,
    ) -> Optional[ChatQueueItem]:
        """Return an item only when both queue and session ownership match."""
        result = await repo_query(
            """
            SELECT * FROM $item_id
            WHERE queue_id = $queue_id
              AND chat_session = $chat_session
            LIMIT 1
            """,
            {
                "item_id": ensure_record_id(item_id),
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
            },
        )
        return _first_model(result, ChatQueueItem)

    @staticmethod
    async def list_revision_changes(
        *,
        queue_id: str,
        chat_session_id: str,
        after_revision: int,
    ) -> Tuple[Optional[ChatQueue], List[ChatQueueItem]]:
        """Return only queue and item records newer than a persisted revision."""
        result = await repo_query(
            """
            RETURN SELECT * FROM $queue_id
            WHERE chat_session = $chat_session
              AND revision > $after_revision
            LIMIT 1;
            RETURN SELECT * FROM chat_queue_item
            WHERE queue_id = $queue_id
              AND chat_session = $chat_session
              AND stream_revision > $after_revision
            ORDER BY position ASC;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "after_revision": after_revision,
            },
        )
        rows = _result_rows(result)
        queue = _first_model(rows, ChatQueue)
        item_prefix = f"{ChatQueueItem.table_name}:"
        items = [
            ChatQueueItem(**row)
            for row in rows
            if str(row.get("id", "")).startswith(item_prefix)
        ]
        return queue, items

    @staticmethod
    async def has_running_item(chat_session_id: str) -> bool:
        """Report whether a session currently owns any running queue item."""
        result = await repo_query(
            """
            SELECT VALUE count() FROM chat_queue_item
            WHERE chat_session = $chat_session
              AND status = 'running'
            GROUP ALL
            """,
            {"chat_session": ensure_record_id(chat_session_id)},
        )
        if not isinstance(result, list) or not result:
            return False
        value = result[0]
        if isinstance(value, list):
            value = value[0] if value else 0
        if isinstance(value, dict):
            value = value.get("count", 0)
        return bool(value)

    @staticmethod
    async def enqueue(
        *,
        chat_session_id: str,
        client_request_id: str,
        prompt: str,
        loop_count: int = 1,
        execution_snapshot: Optional[Dict[str, Any]] = None,
    ) -> ChatQueueItem:
        """Idempotently enqueue one request using a stable deterministic ID."""
        validated = ChatQueueItem(
            queue_id=stable_queue_id(chat_session_id),
            chat_session=chat_session_id,
            client_request_id=client_request_id,
            run_id=stable_item_identity(chat_session_id, client_request_id).run_id,
            position=0,
            prompt=prompt,
            loop_count=loop_count,
            execution_snapshot=execution_snapshot or {},
        )
        identity = stable_item_identity(chat_session_id, client_request_id)
        queue_id = stable_queue_id(chat_session_id)
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $chat_session_row = (SELECT * FROM $chat_session)[0];
            IF $chat_session_row = NONE {
                RETURN { outcome: 'session_missing' };
            } ELSE {
                LET $queue = (SELECT * FROM $queue_id)[0];
                IF $queue = NONE {
                    CREATE ONLY $queue_id CONTENT {
                        chat_session: $chat_session,
                        status: 'active',
                        revision: 0,
                        next_position: 10,
                        runner_state: 'idle',
                        created: time::now(),
                        updated: time::now()
                    };
                };
                LET $existing = (SELECT * FROM $item_id)[0];
                IF $existing = NONE {
                    LET $updated_queue = UPDATE ONLY $queue_id SET
                        next_position = IF next_position = NONE {
                            20
                        } ELSE {
                            next_position + 10
                        },
                        revision += 1
                    WHERE chat_session = $chat_session
                    RETURN AFTER;
                    LET $created = CREATE ONLY $item_id CONTENT {
                        queue_id: $queue_id,
                        chat_session: $chat_session,
                        client_request_id: $client_request_id,
                        run_id: $run_id,
                        position: $updated_queue.next_position - 10,
                        status: 'pending',
                        visible: true,
                        prompt: $prompt,
                        loop_count: $loop_count,
                        current_loop: 0,
                        iteration_token: NONE,
                        execution_snapshot: $execution_snapshot,
                        runner_state: 'idle',
                        stream_revision: $updated_queue.revision,
                        stream_content: '',
                        created: time::now(),
                        updated: time::now()
                    };
                    RETURN $created;
                } ELSE {
                    RETURN $existing;
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "item_id": ensure_record_id(identity.item_id),
                "chat_session": ensure_record_id(chat_session_id),
                "client_request_id": validated.client_request_id,
                "run_id": identity.run_id,
                "prompt": validated.prompt,
                "loop_count": validated.loop_count,
                "execution_snapshot": validated.execution_snapshot,
            },
        )
        if any(row.get("outcome") == "session_missing" for row in _result_rows(result)):
            raise ChatQueueSessionNotFound("Chat session no longer exists")
        item = _first_model(result, ChatQueueItem)
        if item is None:
            rows = await repo_query(
                "SELECT * FROM $item_id",
                {"item_id": ensure_record_id(identity.item_id)},
            )
            item = _first_model(rows, ChatQueueItem)
        if item is None:
            raise ChatQueueError("Failed to enqueue chat item")
        return item

    @staticmethod
    async def pause(queue_id: str) -> ChatQueue:
        """Pause future claims while allowing a running iteration to finish."""
        result = await repo_query(
            """
            UPDATE $queue_id SET
                status = 'paused',
                revision += 1,
                updated = time::now()
            RETURN AFTER
            """,
            {"queue_id": ensure_record_id(queue_id)},
        )
        queue = _first_model(result, ChatQueue)
        if queue is None:
            raise ChatQueueMutationError("Queue does not exist")
        return queue

    @staticmethod
    async def resume(queue_id: str) -> ChatQueue:
        """Resume future claims for a paused queue."""
        result = await repo_query(
            """
            UPDATE $queue_id SET
                status = 'active',
                revision += 1,
                updated = time::now()
            RETURN AFTER
            """,
            {"queue_id": ensure_record_id(queue_id)},
        )
        queue = _first_model(result, ChatQueue)
        if queue is None:
            raise ChatQueueMutationError("Queue does not exist")
        return queue

    @staticmethod
    async def update_item(
        item_id: str,
        *,
        queue_id: str,
        chat_session_id: str,
        prompt: Optional[str] = None,
        loop_count: Optional[int] = None,
        selector_patch: Optional[Dict[str, Any]] = None,
    ) -> ChatQueueItem:
        """Update a pending or failed item while preserving its stable IDs."""
        has_prompt = prompt is not None
        has_loop_count = loop_count is not None
        if prompt is not None:
            trimmed = prompt.strip()
            if not trimmed or len(trimmed) > MAX_CHAT_QUEUE_PROMPT_LENGTH:
                raise ValueError(
                    "prompt must be non-empty and at most 100000 characters"
                )
            prompt = trimmed
        if loop_count is not None:
            if loop_count < 1 or loop_count > 10:
                raise ValueError("loop_count must be between 1 and 10")
        selector_patch = dict(selector_patch or {})
        unknown_selectors = set(selector_patch) - EXECUTION_SELECTOR_FIELDS
        if unknown_selectors:
            raise ValueError(
                f"Unknown execution selectors: {sorted(unknown_selectors)}"
            )
        if not has_prompt and not has_loop_count and not selector_patch:
            raise ValueError("At least one item field must be provided")

        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $candidate = (SELECT * FROM $item_id
            WHERE queue_id = $queue_id
              AND chat_session = $chat_session
              AND status IN ['pending', 'failed']
              AND (
                  $has_loop_count = false
                  OR current_loop <= $loop_count
              ))[0];
            IF $candidate != NONE {
                LET $queue = UPDATE ONLY $queue_id SET revision += 1
                    WHERE chat_session = $chat_session
                    RETURN AFTER;
                LET $updated = UPDATE $item_id SET
                    prompt = IF $has_prompt { $prompt } ELSE { prompt },
                    loop_count = IF $has_loop_count { $loop_count } ELSE { loop_count },
                    execution_snapshot = execution_snapshot + $selector_patch,
                    stream_revision = $queue.revision
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status IN ['pending', 'failed']
                RETURN AFTER;
                RETURN $updated;
            };
            COMMIT TRANSACTION;
            """,
            {
                "item_id": ensure_record_id(item_id),
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "has_prompt": has_prompt,
                "prompt": prompt,
                "has_loop_count": has_loop_count,
                "loop_count": loop_count,
                "selector_patch": selector_patch,
            },
        )
        item = _first_model(result, ChatQueueItem)
        if item is None:
            raise ChatQueueMutationError(
                "Only pending or failed queue items may be updated"
            )
        return item

    @staticmethod
    async def delete_item(item_id: str, *, queue_id: str, chat_session_id: str) -> None:
        """Delete a pending or failed item and reject immutable states."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $candidate = (SELECT * FROM $item_id
            WHERE queue_id = $queue_id
              AND chat_session = $chat_session
              AND status IN ['pending', 'failed'])[0];
            IF $candidate != NONE {
                UPDATE $queue_id SET revision += 1
                    WHERE chat_session = $chat_session;
                LET $deleted = DELETE $item_id
                    WHERE queue_id = $queue_id
                      AND chat_session = $chat_session
                      AND status IN ['pending', 'failed']
                    RETURN BEFORE;
                RETURN $deleted;
            };
            COMMIT TRANSACTION;
            """,
            {
                "item_id": ensure_record_id(item_id),
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
            },
        )
        if not _result_rows(result):
            raise ChatQueueMutationError(
                "Only pending or failed queue items may be deleted"
            )

    @staticmethod
    async def reorder_pending(
        queue_id: str,
        *,
        chat_session_id: str,
        item_ids: Sequence[str],
        expected_revision: int,
    ) -> ChatQueue:
        """Atomically reorder the exact pending set with revision detection."""
        record_ids = [ensure_record_id(item_id) for item_id in item_ids]
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $current_queue = (SELECT * FROM $queue_id
                WHERE chat_session = $chat_session)[0];
            LET $pending_ids = SELECT VALUE id FROM chat_queue_item
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status = 'pending'
                ORDER BY position ASC;
            IF $current_queue = NONE {
                RETURN { outcome: 'pending_set_mismatch', revision: 0 };
            };
            IF $current_queue.revision != $expected_revision {
                RETURN { outcome: 'revision_conflict', revision: $current_queue.revision };
            };
            IF array::sort($pending_ids) != array::sort($item_ids) {
                RETURN { outcome: 'pending_set_mismatch', revision: $current_queue.revision };
            };
            LET $maximum_all_candidate = (
                SELECT VALUE position FROM chat_queue_item
                WHERE queue_id = $queue_id AND chat_session = $chat_session
                ORDER BY position DESC LIMIT 1
            )[0];
            LET $maximum_all_position = IF $maximum_all_candidate = NONE {
                0
            } ELSE {
                $maximum_all_candidate
            };
            LET $maximum_non_pending_candidate = (
                SELECT VALUE position FROM chat_queue_item
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status != 'pending'
                ORDER BY position DESC LIMIT 1
            )[0];
            LET $maximum_non_pending_position =
                IF $maximum_non_pending_candidate = NONE {
                    0
                } ELSE {
                    $maximum_non_pending_candidate
                };
            LET $temporary_base = $maximum_all_position + 1000000;
            LET $final_base = $maximum_non_pending_position;
            LET $queue = UPDATE ONLY $queue_id SET revision += 1
                WHERE chat_session = $chat_session
                RETURN AFTER;
            FOR $index IN 0..array::len($item_ids) {
                UPDATE $item_ids[$index]
                SET
                    position = $temporary_base + $index,
                    stream_revision = $queue.revision
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status = 'pending';
            };
            FOR $index IN 0..array::len($item_ids) {
                UPDATE $item_ids[$index]
                SET
                    position = $final_base + (($index + 1) * 10),
                    stream_revision = $queue.revision
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status = 'pending';
            };
            RETURN $queue;
            COMMIT TRANSACTION;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "item_ids": record_ids,
                "expected_revision": expected_revision,
            },
        )
        rows = _result_rows(result)
        for row in rows:
            if row.get("outcome") == "revision_conflict":
                raise ChatQueueRevisionConflict("Queue revision is stale")
            if row.get("outcome") == "pending_set_mismatch":
                raise ChatQueueMutationError(
                    "Reorder must contain the exact pending set"
                )
        queues = [row for row in rows if row.get("chat_session") is not None]
        if not queues:
            raise ChatQueueMutationError("Queue reorder did not complete")
        return ChatQueue(**queues[-1])

    @staticmethod
    async def acquire_lease(
        *,
        queue_id: str,
        owner: str,
        scheduling_token: str,
        ttl_seconds: int,
    ) -> Optional[ChatQueue]:
        """Acquire a lease for the matching reservation without consuming it."""
        if not owner.strip():
            raise ValueError("owner cannot be empty")
        if not scheduling_token.strip():
            raise ValueError("scheduling_token cannot be empty")
        if ttl_seconds < 1:
            raise ValueError("ttl_seconds must be positive")
        result = await repo_query(
            """
            UPDATE $queue_id SET
                lease_owner = $owner,
                lease_expires_at = time::now() + type::duration($ttl),
                runner_state = 'running',
                revision += 1,
                updated = time::now()
            WHERE scheduling_token = $scheduling_token
              AND runner_state IN ['scheduled', 'running']
              AND (
                  lease_owner = NONE
                  OR lease_owner = $owner
                  OR lease_expires_at = NONE
                  OR lease_expires_at <= time::now()
              )
            RETURN AFTER
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "owner": owner,
                "scheduling_token": scheduling_token,
                "ttl": f"{ttl_seconds}s",
            },
        )
        return _first_model(result, ChatQueue)

    @staticmethod
    async def renew_lease(
        *,
        queue_id: str,
        owner: str,
        ttl_seconds: int,
    ) -> Optional[ChatQueue]:
        """Atomically renew a non-expired lease held by its current owner."""
        if ttl_seconds < 1:
            raise ValueError("ttl_seconds must be positive")
        result = await repo_query(
            """
            UPDATE $queue_id SET
                lease_expires_at = time::now() + type::duration($ttl),
                revision += 1,
                updated = time::now()
            WHERE lease_owner = $owner
              AND lease_expires_at > time::now()
            RETURN AFTER
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "owner": owner,
                "ttl": f"{ttl_seconds}s",
            },
        )
        return _first_model(result, ChatQueue)

    @staticmethod
    async def finalize_runner(
        *,
        queue_id: str,
        chat_session_id: str,
        owner: str,
        command_id: Optional[str] = None,
    ) -> RunnerFinalizationResult:
        """Atomically continue pending work or clear an owned drained runner."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $queue = (SELECT * FROM $queue_id
                WHERE chat_session = $chat_session
                  AND lease_owner = $owner
                  AND lease_expires_at > time::now()
                  AND (
                      $command_id = NONE
                      OR runner_command_id = $command_id
                  )
                  AND runner_state = 'running')[0];
            IF $queue = NONE {
                RETURN { outcome: 'stale' };
            } ELSE {
                LET $pending = SELECT VALUE id FROM chat_queue_item
                    WHERE queue_id = $queue_id
                      AND chat_session = $chat_session
                      AND status = 'pending'
                    LIMIT 1;
                IF $queue.status = 'active'
                   AND array::len($pending) > 0 {
                    RETURN { outcome: 'continue', queue: $queue };
                } ELSE {
                    LET $finalized = UPDATE ONLY $queue_id SET
                        runner_state = 'idle',
                        runner_command_id = NONE,
                        scheduling_token = NONE,
                        scheduling_expires_at = NONE,
                        lease_owner = NONE,
                        lease_expires_at = NONE,
                        revision += 1
                    WHERE chat_session = $chat_session
                      AND lease_owner = $owner
                      AND lease_expires_at > time::now()
                      AND (
                          $command_id = NONE
                          OR runner_command_id = $command_id
                      )
                      AND runner_state = 'running'
                    RETURN AFTER;
                    IF $finalized != NONE {
                        RETURN { outcome: 'finalized', queue: $finalized };
                    } ELSE {
                        RETURN { outcome: 'stale' };
                    };
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "owner": owner,
                "command_id": command_id,
            },
        )
        for row in _result_rows(result):
            outcome = row.get("outcome")
            if outcome not in {"continue", "finalized", "stale"}:
                continue
            queue_data = row.get("queue")
            if isinstance(queue_data, list):
                queue_data = queue_data[0] if queue_data else None
            queue = ChatQueue(**queue_data) if isinstance(queue_data, dict) else None
            return RunnerFinalizationResult(outcome=outcome, queue=queue)
        return RunnerFinalizationResult(outcome="stale", queue=None)

    @staticmethod
    async def release_lease(
        *,
        queue_id: str,
        chat_session_id: str,
        owner: str,
        command_id: Optional[str] = None,
    ) -> bool:
        """Finalize an owned runner and report whether the guard matched."""
        result = await ChatQueueRepository.finalize_runner(
            queue_id=queue_id,
            chat_session_id=chat_session_id,
            owner=owner,
            command_id=command_id,
        )
        return result.finalized

    @staticmethod
    async def reserve_runner(
        *,
        queue_id: str,
        chat_session_id: str,
        scheduling_token: str,
        ttl_seconds: int,
    ) -> ChatQueue:
        """Reserve scheduling unless a runner or unexpired reservation exists."""
        if not scheduling_token.strip():
            raise ValueError("scheduling_token cannot be empty")
        if ttl_seconds < 1:
            raise ValueError("ttl_seconds must be positive")
        result = await repo_query(
            """
            UPDATE $queue_id SET
                runner_command_id = NONE,
                runner_state = 'scheduled',
                scheduling_token = $scheduling_token,
                scheduling_expires_at = time::now() + type::duration($ttl),
                lease_owner = NONE,
                lease_expires_at = NONE,
                revision += 1
            WHERE chat_session = $chat_session
              AND status = 'active'
              AND (
                  lease_owner = NONE
                  OR lease_expires_at = NONE
                  OR lease_expires_at <= time::now()
              )
              AND (
                  runner_state = 'idle'
                  OR (
                      runner_state = 'scheduled'
                      AND (
                          scheduling_expires_at = NONE
                          OR scheduling_expires_at <= time::now()
                      )
                  )
                  OR runner_state = 'running'
              )
            RETURN AFTER
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "scheduling_token": scheduling_token,
                "ttl": f"{ttl_seconds}s",
            },
        )
        queue = _first_model(result, ChatQueue)
        if queue is None:
            raise ChatQueueMutationError("Queue runner is already scheduled or active")
        return queue

    @staticmethod
    async def confirm_runner_command(
        *,
        queue_id: str,
        chat_session_id: str,
        scheduling_token: str,
        command_id: str,
    ) -> Optional[ChatQueue]:
        """Bind a command in either ordering or accept an already-clean finish."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $queue = (SELECT * FROM $queue_id
                WHERE chat_session = $chat_session)[0];
            IF $queue != NONE {
                IF $queue.scheduling_token = $scheduling_token
                   AND $queue.runner_state IN ['scheduled', 'running'] {
                    IF $queue.runner_command_id = NONE {
                        UPDATE ONLY $queue_id SET
                            runner_command_id = $command_id,
                            revision += 1
                        WHERE chat_session = $chat_session
                          AND scheduling_token = $scheduling_token
                          AND runner_state IN ['scheduled', 'running']
                        RETURN AFTER;
                    } ELSE IF $queue.runner_command_id = $command_id {
                        RETURN $queue;
                    };
                } ELSE IF $queue.runner_state = 'idle'
                    AND $queue.runner_command_id = NONE
                    AND $queue.scheduling_token = NONE
                    AND $queue.lease_owner = NONE {
                    RETURN $queue;
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "scheduling_token": scheduling_token,
                "command_id": command_id,
            },
        )
        return _first_model(result, ChatQueue)

    @staticmethod
    async def reset_runner_reservation(
        *,
        queue_id: str,
        chat_session_id: str,
        scheduling_token: str,
    ) -> Optional[ChatQueue]:
        """Clear only the definitive failed scheduling reservation."""
        result = await repo_query(
            """
            UPDATE $queue_id SET
                runner_state = 'idle',
                runner_command_id = NONE,
                scheduling_token = NONE,
                scheduling_expires_at = NONE,
                revision += 1
            WHERE chat_session = $chat_session
              AND runner_state = 'scheduled'
              AND scheduling_token = $scheduling_token
            RETURN AFTER
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "scheduling_token": scheduling_token,
            },
        )
        return _first_model(result, ChatQueue)

    @staticmethod
    async def clear_unleased_schedule(
        *,
        queue_id: str,
        chat_session_id: str,
    ) -> Optional[ChatQueue]:
        """Drop a scheduled reservation when no live lease is held.

        Manual resume uses this so a stale schedule left from pause/fail can
        be replaced with a fresh drain command.
        """
        result = await repo_query(
            """
            UPDATE $queue_id SET
                runner_state = 'idle',
                runner_command_id = NONE,
                scheduling_token = NONE,
                scheduling_expires_at = NONE,
                revision += 1,
                updated = time::now()
            WHERE chat_session = $chat_session
              AND status = 'active'
              AND runner_state = 'scheduled'
              AND (
                  lease_owner = NONE
                  OR lease_expires_at = NONE
                  OR lease_expires_at <= time::now()
              )
            RETURN AFTER
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
            },
        )
        return _first_model(result, ChatQueue)

    @staticmethod
    async def claim_next(
        *,
        queue_id: str,
        chat_session_id: str,
        lease_owner: str,
    ) -> Optional[ChatQueueItem]:
        """Adopt a running item or atomically claim the lowest pending item."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $current_queue = (SELECT * FROM $queue_id
                WHERE chat_session = $chat_session
                  AND lease_owner = $lease_owner
                  AND lease_expires_at > time::now())[0];
            IF $current_queue != NONE {
                LET $running = (SELECT * FROM chat_queue_item
                    WHERE queue_id = $queue_id
                      AND chat_session = $chat_session
                      AND status = 'running'
                    ORDER BY position ASC LIMIT 1)[0];
                IF $running != NONE {
                    RETURN $running;
                };
                IF $current_queue.status = 'active' {
                    LET $next = (SELECT * FROM chat_queue_item
                        WHERE queue_id = $queue_id
                          AND chat_session = $chat_session
                          AND status = 'pending'
                        ORDER BY position ASC LIMIT 1)[0];
                    IF $next != NONE {
                        LET $queue = UPDATE ONLY $queue_id SET revision += 1
                            WHERE chat_session = $chat_session
                              AND lease_owner = $lease_owner
                              AND lease_expires_at > time::now()
                            RETURN AFTER;
                        IF $queue != NONE {
                            UPDATE $next.id SET
                                status = 'running',
                                current_loop = 1,
                                iteration_token = string::concat(
                                    $next.run_id, '/1/', $claim_token
                                ),
                                runner_state = 'running',
                                stream_revision = $queue.revision,
                                started_at = time::now()
                            WHERE queue_id = $queue_id
                              AND chat_session = $chat_session
                              AND status = 'pending'
                            RETURN AFTER;
                        };
                    };
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "lease_owner": lease_owner,
                "claim_token": f"{uuid4().hex}",
            },
        )
        return _first_model(result, ChatQueueItem)

    @staticmethod
    async def mark_stream_progress(
        *,
        item_id: str,
        queue_id: str,
        chat_session_id: str,
        run_id: str,
        lease_owner: str,
        expected_revision: int,
        content: str,
        progress: Optional[Dict[str, Any]] = None,
        activity: Optional[Dict[str, Any]] = None,
    ) -> ChatQueueItem:
        """Atomically persist a newer reconnectable stream snapshot."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $lease_ok = (SELECT * FROM $queue_id
                WHERE chat_session = $chat_session
                  AND lease_owner = $lease_owner
                  AND lease_expires_at > time::now())[0];
            LET $candidate = (SELECT * FROM $item_id
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status = 'running'
                  AND run_id = $run_id)[0];
            IF $lease_ok != NONE AND $candidate != NONE {
                LET $queue = UPDATE ONLY $queue_id SET revision += 1
                    WHERE chat_session = $chat_session
                      AND lease_owner = $lease_owner
                      AND lease_expires_at > time::now()
                    RETURN AFTER;
                IF $queue != NONE {
                    UPDATE $item_id SET
                        stream_revision = $queue.revision,
                        stream_content = $content,
                        stream_progress = $progress,
                        stream_activity = $activity
                    WHERE queue_id = $queue_id
                      AND chat_session = $chat_session
                      AND status = 'running'
                      AND run_id = $run_id
                    RETURN AFTER;
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "item_id": ensure_record_id(item_id),
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "run_id": run_id,
                "lease_owner": lease_owner,
                "expected_revision": expected_revision,
                "content": content,
                "progress": progress,
                "activity": activity,
            },
        )
        item = _first_model(result, ChatQueueItem)
        if item is None:
            raise ChatQueueMutationError(
                "Stream update rejected because the run is not active"
            )
        return item

    @staticmethod
    async def complete_loop_iteration(
        *,
        item_id: str,
        queue_id: str,
        chat_session_id: str,
        run_id: str,
        lease_owner: str,
        expected_loop: int,
        iteration_token: str,
    ) -> ChatQueueItem:
        """Compare-and-set one loop completion so retries cannot advance twice."""
        if expected_loop < 1 or expected_loop > 10:
            raise ValueError("expected_loop must be between 1 and 10")
        if not iteration_token:
            raise ValueError("iteration_token cannot be empty")
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $lease_ok = (SELECT * FROM $queue_id
                WHERE chat_session = $chat_session
                  AND lease_owner = $lease_owner
                  AND lease_expires_at > time::now())[0];
            LET $item = (SELECT * FROM $item_id
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status = 'running'
                  AND run_id = $run_id
                  AND current_loop = $expected_loop
                  AND iteration_token = $iteration_token)[0];
            IF $lease_ok != NONE AND $item != NONE {
                LET $queue = UPDATE ONLY $queue_id SET revision += 1
                    WHERE chat_session = $chat_session
                      AND lease_owner = $lease_owner
                      AND lease_expires_at > time::now()
                    RETURN AFTER;
                IF $queue != NONE AND $expected_loop >= $item.loop_count {
                    UPDATE $item_id SET
                        status = 'completed',
                        runner_state = 'completed',
                        visible = false,
                        completed_at = time::now(),
                        iteration_token = NONE,
                        stream_revision = $queue.revision
                    WHERE queue_id = $queue_id
                      AND chat_session = $chat_session
                      AND current_loop = $expected_loop
                      AND iteration_token = $iteration_token
                    RETURN AFTER;
                } ELSE IF $queue != NONE {
                    UPDATE $item_id SET
                        current_loop = $expected_loop + 1,
                        iteration_token = $next_iteration_token,
                        stream_revision = $queue.revision,
                        stream_content = '',
                        stream_progress = NONE,
                        stream_activity = NONE
                    WHERE queue_id = $queue_id
                      AND chat_session = $chat_session
                      AND current_loop = $expected_loop
                      AND iteration_token = $iteration_token
                    RETURN AFTER;
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "item_id": ensure_record_id(item_id),
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "run_id": run_id,
                "lease_owner": lease_owner,
                "expected_loop": expected_loop,
                "iteration_token": iteration_token,
                "next_iteration_token": f"{run_id}/{expected_loop + 1}/{uuid4().hex}",
            },
        )
        item = _first_model(result, ChatQueueItem)
        if item is None:
            raise ChatQueueMutationError(
                "Loop completion rejected because the run is not active"
            )
        return item

    @staticmethod
    async def fail_item_and_pause(
        *,
        item_id: str,
        queue_id: str,
        chat_session_id: str,
        run_id: str,
        lease_owner: str,
        error_type: str,
        error_message: str,
        error_details: Optional[Dict[str, Any]] = None,
    ) -> ChatQueueItem:
        """Fail an active item without pausing the queue.

        Play/pause is a user control. Automatic pauses trapped deferred prompts
        after handoff races. Failed items stay visible for retry/delete while
        the drain continues with later pending work.
        """
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $lease_ok = (SELECT * FROM $queue_id
                WHERE chat_session = $chat_session
                  AND lease_owner = $lease_owner
                  AND lease_expires_at > time::now())[0];
            LET $item = (SELECT * FROM $item_id
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status = 'running'
                  AND run_id = $run_id)[0];
            IF $lease_ok != NONE AND $item != NONE {
                LET $queue = UPDATE ONLY $queue_id SET
                    revision += 1
                WHERE chat_session = $chat_session
                  AND lease_owner = $lease_owner
                  AND lease_expires_at > time::now()
                RETURN AFTER;
                IF $queue != NONE {
                    LET $failed = UPDATE $item_id SET
                        status = 'failed',
                        runner_state = 'failed',
                        error_type = $error_type,
                        error_message = $error_message,
                        error_details = $error_details,
                        failed_at = time::now(),
                        iteration_token = NONE,
                        stream_revision = $queue.revision
                    WHERE queue_id = $queue_id
                      AND chat_session = $chat_session
                      AND status = 'running'
                      AND run_id = $run_id
                    RETURN AFTER;
                    RETURN $failed;
                };
            };
            COMMIT TRANSACTION;
            """,
            {
                "item_id": ensure_record_id(item_id),
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "run_id": run_id,
                "lease_owner": lease_owner,
                "error_type": error_type,
                "error_message": error_message,
                "error_details": error_details,
            },
        )
        item = _first_model(result, ChatQueueItem)
        if item is None:
            raise ChatQueueMutationError(
                "Failure update rejected because the run is not active"
            )
        return item

    @staticmethod
    async def retry_failed(
        *, item_id: str, queue_id: str, chat_session_id: str
    ) -> ChatQueueItem:
        """Reset a failed item to a clean pending state without changing run ID."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $candidate = (SELECT * FROM $item_id
            WHERE queue_id = $queue_id
              AND chat_session = $chat_session
              AND status = $failed_status)[0];
            IF $candidate != NONE {
                LET $queue = UPDATE ONLY $queue_id SET revision += 1
                    WHERE chat_session = $chat_session
                    RETURN AFTER;
                LET $retried = UPDATE $item_id SET
                    status = $pending_status,
                    current_loop = 0,
                    iteration_token = NONE,
                    runner_command_id = NONE,
                    runner_state = 'idle',
                    stream_revision = $queue.revision,
                    stream_content = '',
                    stream_progress = NONE,
                    stream_activity = NONE,
                    error_type = NONE,
                    error_message = NONE,
                    error_details = NONE,
                    started_at = NONE,
                    completed_at = NONE,
                    failed_at = NONE
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status = $failed_status
                RETURN AFTER;
                RETURN $retried;
            };
            COMMIT TRANSACTION;
            """,
            {
                "item_id": ensure_record_id(item_id),
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "failed_status": "failed",
                "pending_status": "pending",
            },
        )
        item = _first_model(result, ChatQueueItem)
        if item is None:
            raise ChatQueueMutationError("Only failed queue items may be retried")
        return item

    @staticmethod
    async def cleanup_terminal_items(
        queue_id: str,
        *,
        chat_session_id: str,
        completed_before: datetime,
    ) -> int:
        """Delete completed/cancelled items older than the supplied cutoff."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $deleted = DELETE chat_queue_item
                WHERE queue_id = $queue_id
                  AND chat_session = $chat_session
                  AND status IN ['completed', 'cancelled']
                  AND updated < $completed_before
                RETURN BEFORE;
            IF array::len($deleted) > 0 {
                UPDATE $queue_id SET revision += 1
                    WHERE chat_session = $chat_session;
                RETURN $deleted;
            };
            COMMIT TRANSACTION;
            """,
            {
                "queue_id": ensure_record_id(queue_id),
                "chat_session": ensure_record_id(chat_session_id),
                "completed_before": completed_before,
            },
        )
        return len(_result_rows(result))

    @staticmethod
    async def delete_session_if_idle(chat_session_id: str) -> bool:
        """Atomically reject running work or delete session and all queue state."""
        result = await repo_query(
            """
            BEGIN TRANSACTION;
            LET $chat_session_row = (SELECT * FROM $chat_session)[0];
            IF $chat_session_row = NONE {
                RETURN { outcome: 'missing' };
            } ELSE {
                LET $running = SELECT VALUE id FROM chat_queue_item
                    WHERE chat_session = $chat_session
                      AND status = 'running'
                    LIMIT 1;
                IF array::len($running) > 0 {
                    RETURN { outcome: 'running' };
                } ELSE {
                    DELETE chat_queue_item WHERE chat_session = $chat_session;
                    DELETE chat_queue WHERE chat_session = $chat_session;
                    DELETE $chat_session;
                    RETURN { outcome: 'deleted' };
                };
            };
            COMMIT TRANSACTION;
            """,
            {"chat_session": ensure_record_id(chat_session_id)},
        )
        rows = _result_rows(result)
        if any(row.get("outcome") == "running" for row in rows):
            raise ChatQueueMutationError(
                "Cannot delete a chat session while a queue item is running"
            )
        return any(row.get("outcome") == "deleted" for row in rows)

    @staticmethod
    async def delete_for_session(chat_session_id: str) -> None:
        """Remove all queue state owned by a deleted chat session."""
        await repo_query(
            """
            BEGIN TRANSACTION;
            DELETE chat_queue_item WHERE chat_session = $chat_session;
            DELETE chat_queue WHERE chat_session = $chat_session;
            COMMIT TRANSACTION;
            """,
            {"chat_session": ensure_record_id(chat_session_id)},
        )

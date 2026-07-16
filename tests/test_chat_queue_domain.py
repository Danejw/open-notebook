"""Focused tests for the persistent per-session chat queue contract."""

import asyncio
from datetime import datetime, timedelta, timezone
from importlib import import_module
from importlib.util import find_spec
from inspect import getsource, signature
from pathlib import Path
from types import ModuleType
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError


def _queue_domain() -> ModuleType:
    """Load the queue domain after asserting that Task 1 created it."""
    spec = find_spec("construction_os.domain.chat_queue")
    assert spec is not None, (
        "construction_os.domain.chat_queue has not been implemented"
    )
    return import_module("construction_os.domain.chat_queue")


def _queue_row(**overrides):
    now = datetime.now(timezone.utc)
    row = {
        "id": "chat_queue:queue-a",
        "chat_session": "chat_session:session-a",
        "status": "active",
        "revision": 0,
        "next_position": 10,
        "runner_state": "idle",
        "runner_command_id": None,
        "scheduling_token": None,
        "scheduling_expires_at": None,
        "lease_owner": None,
        "lease_expires_at": None,
        "created": now,
        "updated": now,
    }
    row.update(overrides)
    return row


def _item_row(**overrides):
    now = datetime.now(timezone.utc)
    row = {
        "id": "chat_queue_item:item-a",
        "queue_id": "chat_queue:queue-a",
        "chat_session": "chat_session:session-a",
        "client_request_id": "request-a",
        "run_id": "run-a",
        "position": 10,
        "status": "pending",
        "visible": True,
        "prompt": "Summarize the project",
        "loop_count": 1,
        "current_loop": 0,
        "execution_snapshot": {"model_id": "model:gpt"},
        "runner_command_id": None,
        "runner_state": "idle",
        "stream_revision": 0,
        "stream_content": "",
        "stream_progress": None,
        "stream_activity": None,
        "error_type": None,
        "error_message": None,
        "error_details": None,
        "started_at": None,
        "completed_at": None,
        "failed_at": None,
        "created": now,
        "updated": now,
    }
    row.update(overrides)
    return row


def test_stable_item_and_run_ids_are_session_scoped():
    queue = _queue_domain()

    first = queue.stable_item_identity("chat_session:a", "request-1")
    repeated = queue.stable_item_identity("chat_session:a", "request-1")
    other_session = queue.stable_item_identity("chat_session:b", "request-1")

    assert first == repeated
    assert first != other_session
    assert first.item_id.startswith("chat_queue_item:")
    assert first.run_id.startswith("chat-queue-run-")


@pytest.mark.parametrize("prompt", ["", " ", "\n\t"])
def test_queue_item_rejects_blank_prompt(prompt):
    queue = _queue_domain()

    with pytest.raises(ValidationError):
        queue.ChatQueueItem(
            queue_id="chat_queue:q",
            chat_session="chat_session:s",
            client_request_id="request",
            run_id="run",
            position=10,
            prompt=prompt,
        )


def test_queue_item_trims_prompt():
    queue = _queue_domain()

    item = queue.ChatQueueItem(
        queue_id="chat_queue:q",
        chat_session="chat_session:s",
        client_request_id="request",
        run_id="run",
        position=10,
        prompt="  explain this  ",
    )

    assert item.prompt == "explain this"


@pytest.mark.parametrize("loop_count", [0, 11])
def test_queue_item_rejects_loop_count_outside_one_to_ten(loop_count):
    queue = _queue_domain()

    with pytest.raises(ValidationError):
        queue.ChatQueueItem(
            queue_id="chat_queue:q",
            chat_session="chat_session:s",
            client_request_id="request",
            run_id="run",
            position=10,
            prompt="Explain this",
            loop_count=loop_count,
        )


def test_complete_loop_state_is_sequential_and_bounded():
    queue = _queue_domain()

    assert queue.next_loop_state(current_loop=1, loop_count=3) == ("running", 2)
    assert queue.next_loop_state(current_loop=3, loop_count=3) == ("completed", 3)

    with pytest.raises(ValueError):
        queue.next_loop_state(current_loop=0, loop_count=11)


def test_reorder_requires_current_revision_and_exact_pending_set():
    queue = _queue_domain()
    pending = ["chat_queue_item:a", "chat_queue_item:b"]

    queue.validate_pending_reorder(
        requested_ids=list(reversed(pending)),
        pending_ids=pending,
        expected_revision=4,
        current_revision=4,
    )

    with pytest.raises(queue.ChatQueueRevisionConflict):
        queue.validate_pending_reorder(
            requested_ids=pending,
            pending_ids=pending,
            expected_revision=3,
            current_revision=4,
        )

    with pytest.raises(queue.ChatQueueMutationError, match="exact pending set"):
        queue.validate_pending_reorder(
            requested_ids=["chat_queue_item:a"],
            pending_ids=pending,
            expected_revision=4,
            current_revision=4,
        )

    with pytest.raises(queue.ChatQueueMutationError, match="exact pending set"):
        queue.validate_pending_reorder(
            requested_ids=["chat_queue_item:a", "chat_queue_item:a"],
            pending_ids=pending,
            expected_revision=4,
            current_revision=4,
        )


@pytest.mark.parametrize("operation", ["update", "delete"])
@pytest.mark.parametrize("status", ["pending", "failed"])
def test_pending_and_failed_items_are_mutable(operation, status):
    queue = _queue_domain()

    queue.assert_item_mutable(status, operation=operation)


@pytest.mark.parametrize("operation", ["update", "delete"])
@pytest.mark.parametrize("status", ["running", "completed", "cancelled"])
def test_running_and_terminal_items_reject_user_mutation(operation, status):
    queue = _queue_domain()

    with pytest.raises(queue.ChatQueueMutationError):
        queue.assert_item_mutable(status, operation=operation)


@pytest.mark.asyncio
async def test_enqueue_is_idempotent_by_client_request_id(monkeypatch):
    queue = _queue_domain()
    persisted = _item_row()
    query = AsyncMock(side_effect=[[persisted], [persisted]])
    monkeypatch.setattr(queue, "repo_query", query)

    first = await queue.ChatQueueRepository.enqueue(
        chat_session_id="chat_session:session-a",
        client_request_id="request-a",
        prompt="Summarize the project",
        loop_count=1,
        execution_snapshot={"model_id": "model:gpt"},
    )
    repeated = await queue.ChatQueueRepository.enqueue(
        chat_session_id="chat_session:session-a",
        client_request_id="request-a",
        prompt="A conflicting retry payload",
        loop_count=2,
        execution_snapshot={"model_id": "model:other"},
    )

    assert first.id == repeated.id
    assert first.run_id == repeated.run_id
    assert query.await_count == 2
    first_vars = query.await_args_list[0].args[1]
    second_vars = query.await_args_list[1].args[1]
    assert first_vars["item_id"] == second_vars["item_id"]
    assert first_vars["run_id"] == second_vars["run_id"]
    assert "BEGIN TRANSACTION" in query.await_args_list[0].args[0]


@pytest.mark.asyncio
async def test_enqueue_returns_created_item_when_transaction_rows_precede_it(
    monkeypatch,
):
    queue = _queue_domain()
    created_item = _item_row(id="chat_queue_item:created")
    query = AsyncMock(
        return_value=[
            _queue_row(revision=1),
            created_item,
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    item = await queue.ChatQueueRepository.enqueue(
        chat_session_id="chat_session:session-a",
        client_request_id="request-a",
        prompt="Summarize the project",
    )

    assert item.id == "chat_queue_item:created"
    statement = " ".join(query.await_args.args[0].split())
    create_index = statement.index("LET $created = CREATE ONLY $item_id")
    revision_index = statement.index("revision += 1")
    return_index = statement.index("RETURN $created")
    assert revision_index < create_index < return_index


@pytest.mark.asyncio
async def test_get_or_create_uses_soft_lookups_for_missing_records(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(return_value=[_queue_row()])
    monkeypatch.setattr(queue, "repo_query", query)

    await queue.ChatQueueRepository.get_or_create("chat_session:session-a")

    statement = " ".join(query.await_args.args[0].split())
    assert "LET $chat_session_row = (SELECT * FROM $chat_session)[0]" in statement
    assert "LET $existing = (SELECT * FROM $queue_id)[0]" in statement
    assert "SELECT * FROM ONLY $chat_session" not in statement
    assert "SELECT * FROM ONLY $queue_id" not in statement


@pytest.mark.asyncio
async def test_enqueue_revalidates_session_and_allocates_position_from_queue(
    monkeypatch,
):
    queue = _queue_domain()
    query = AsyncMock(return_value=[_item_row(position=40, stream_revision=7)])
    monkeypatch.setattr(queue, "repo_query", query)

    item = await queue.ChatQueueRepository.enqueue(
        chat_session_id="chat_session:session-a",
        client_request_id="request-a",
        prompt="Summarize the project",
    )

    statement = " ".join(query.await_args.args[0].split())
    assert "LET $chat_session_row = (SELECT * FROM $chat_session)[0]" in statement
    assert "IF $chat_session_row = NONE" in statement
    assert "LET $queue = (SELECT * FROM $queue_id)[0]" in statement
    assert "LET $existing = (SELECT * FROM $item_id)[0]" in statement
    assert "SELECT * FROM ONLY $chat_session" not in statement
    assert "SELECT * FROM ONLY $queue_id" not in statement
    assert "SELECT * FROM ONLY $item_id" not in statement
    assert "next_position" in statement
    assert "LET $last_position" not in statement
    assert "stream_revision: $updated_queue.revision" in statement
    assert item.position == 40
    assert item.stream_revision == 7


@pytest.mark.asyncio
async def test_claim_next_uses_soft_lookups_when_no_pending_item(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(return_value=[])
    monkeypatch.setattr(queue, "repo_query", query)

    claimed = await queue.ChatQueueRepository.claim_next(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        lease_owner="owner-a",
    )

    assert claimed is None
    statement = " ".join(query.await_args.args[0].split())
    assert "SELECT * FROM ONLY" not in statement
    assert "LIMIT 1)[0]" in statement


@pytest.mark.asyncio
async def test_enqueue_rejects_session_deleted_before_transaction(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(return_value=[{"outcome": "session_missing"}])
    monkeypatch.setattr(queue, "repo_query", query)

    with pytest.raises(queue.ChatQueueSessionNotFound):
        await queue.ChatQueueRepository.enqueue(
            chat_session_id="chat_session:deleted",
            client_request_id="request-a",
            prompt="Must not create an orphan",
        )

    assert query.await_count == 1


@pytest.mark.asyncio
async def test_concurrent_enqueues_allocate_unique_monotonic_positions(monkeypatch):
    queue = _queue_domain()
    next_position = 10
    revision = 0
    lock = asyncio.Lock()

    async def allocate_from_queue(statement, variables):
        nonlocal next_position, revision
        normalized = " ".join(statement.split())
        assert "next_position = IF next_position = NONE" in normalized
        assert "next_position + 10" in normalized
        async with lock:
            position = next_position
            next_position += 10
            revision += 1
        return [
            _item_row(
                id=str(variables["item_id"]),
                client_request_id=variables["client_request_id"],
                run_id=variables["run_id"],
                position=position,
                stream_revision=revision,
            )
        ]

    monkeypatch.setattr(queue, "repo_query", allocate_from_queue)

    first, second = await asyncio.gather(
        queue.ChatQueueRepository.enqueue(
            chat_session_id="chat_session:session-a",
            client_request_id="request-a",
            prompt="First",
        ),
        queue.ChatQueueRepository.enqueue(
            chat_session_id="chat_session:session-a",
            client_request_id="request-b",
            prompt="Second",
        ),
    )

    assert sorted([first.position, second.position]) == [10, 20]
    assert sorted([first.stream_revision, second.stream_revision]) == [1, 2]


@pytest.mark.asyncio
async def test_lease_acquisition_is_exclusive_and_atomic(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(side_effect=[[_queue_row(lease_owner="worker-a")], []])
    monkeypatch.setattr(queue, "repo_query", query)

    acquired = await queue.ChatQueueRepository.acquire_lease(
        queue_id="chat_queue:queue-a",
        owner="worker-a",
        scheduling_token="token:a",
        ttl_seconds=30,
    )
    denied = await queue.ChatQueueRepository.acquire_lease(
        queue_id="chat_queue:queue-a",
        owner="worker-b",
        scheduling_token="token:b",
        ttl_seconds=30,
    )

    assert acquired is not None
    assert acquired.lease_owner == "worker-a"
    assert denied is None
    statement = query.await_args_list[0].args[0]
    assert "UPDATE" in statement
    assert "lease_expires_at" in statement
    assert "lease_owner" in statement


@pytest.mark.asyncio
async def test_confirm_before_acquire_retains_reservation_identity(monkeypatch):
    queue = _queue_domain()
    confirmed = _queue_row(
        runner_state="scheduled",
        runner_command_id="command:one",
        scheduling_token="token:one",
        scheduling_expires_at=datetime.now(timezone.utc) + timedelta(seconds=30),
    )
    acquired = _queue_row(
        runner_state="running",
        runner_command_id="command:one",
        scheduling_token="token:one",
        scheduling_expires_at=confirmed["scheduling_expires_at"],
        lease_owner="worker-a",
        lease_expires_at=datetime.now(timezone.utc) + timedelta(seconds=30),
    )
    query = AsyncMock(side_effect=[[confirmed], [acquired]])
    monkeypatch.setattr(queue, "repo_query", query)

    bound = await queue.ChatQueueRepository.confirm_runner_command(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        scheduling_token="token:one",
        command_id="command:one",
    )
    leased = await queue.ChatQueueRepository.acquire_lease(
        queue_id="chat_queue:queue-a",
        owner="worker-a",
        scheduling_token="token:one",
        ttl_seconds=30,
    )

    assert bound is not None
    assert leased is not None
    assert leased.runner_state == "running"
    assert leased.scheduling_token == "token:one"
    confirm_sql = " ".join(query.await_args_list[0].args[0].split())
    acquire_sql = " ".join(query.await_args_list[1].args[0].split())
    assert "runner_state IN ['scheduled', 'running']" in confirm_sql
    assert "runner_command_id = $command_id, scheduling_token = NONE" not in confirm_sql
    assert "scheduling_token = $scheduling_token" in acquire_sql
    assert "scheduling_token = NONE" not in acquire_sql


@pytest.mark.asyncio
async def test_acquire_before_confirm_binds_running_reservation(monkeypatch):
    queue = _queue_domain()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
    acquired = _queue_row(
        runner_state="running",
        scheduling_token="token:one",
        scheduling_expires_at=expires_at,
        lease_owner="worker-a",
        lease_expires_at=expires_at,
    )
    confirmed = {
        **acquired,
        "runner_command_id": "command:one",
        "revision": acquired["revision"] + 1,
    }
    query = AsyncMock(side_effect=[[acquired], [confirmed]])
    monkeypatch.setattr(queue, "repo_query", query)

    leased = await queue.ChatQueueRepository.acquire_lease(
        queue_id="chat_queue:queue-a",
        owner="worker-a",
        scheduling_token="token:one",
        ttl_seconds=30,
    )
    bound = await queue.ChatQueueRepository.confirm_runner_command(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        scheduling_token="token:one",
        command_id="command:one",
    )

    assert leased is not None
    assert bound is not None
    assert bound.runner_state == "running"
    assert bound.runner_command_id == "command:one"
    assert bound.scheduling_token == "token:one"


@pytest.mark.asyncio
async def test_finish_before_confirm_is_benign_and_reschedulable(monkeypatch):
    queue = _queue_domain()
    idle = _queue_row(
        runner_state="idle",
        runner_command_id=None,
        scheduling_token=None,
        scheduling_expires_at=None,
        lease_owner=None,
        lease_expires_at=None,
    )
    query = AsyncMock(
        side_effect=[
            [{"outcome": "finalized", "queue": idle}],
            [idle],
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    finalized = await queue.ChatQueueRepository.finalize_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker-a",
        command_id=None,
    )
    late_confirmation = await queue.ChatQueueRepository.confirm_runner_command(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        scheduling_token="token:one",
        command_id="command:one",
    )

    assert finalized.finalized is True
    assert late_confirmation is not None
    assert late_confirmation.runner_state == "idle"
    assert late_confirmation.runner_command_id is None
    finalize_sql = " ".join(query.await_args_list[0].args[0].split())
    confirm_sql = " ".join(query.await_args_list[1].args[0].split())
    assert "$command_id = NONE OR runner_command_id = $command_id" in finalize_sql
    assert "runner_state = 'idle'" in confirm_sql


@pytest.mark.asyncio
async def test_enqueue_before_finalize_tells_worker_to_continue(monkeypatch):
    queue = _queue_domain()
    running = _queue_row(
        runner_state="running",
        runner_command_id="command:one",
        scheduling_token="token:one",
        lease_owner="worker-a",
        lease_expires_at=datetime.now(timezone.utc) + timedelta(seconds=30),
    )
    query = AsyncMock(return_value=[{"outcome": "continue", "queue": running}])
    monkeypatch.setattr(queue, "repo_query", query)

    result = await queue.ChatQueueRepository.finalize_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker-a",
        command_id="command:one",
    )

    assert result.outcome == "continue"
    assert result.should_continue is True
    assert result.finalized is False
    assert result.queue is not None
    assert result.queue.lease_owner == "worker-a"
    statement = " ".join(query.await_args.args[0].split())
    assert "BEGIN TRANSACTION" in statement
    pending_index = statement.index("status = 'pending'")
    finalize_index = statement.index("runner_state = 'idle'")
    assert pending_index < finalize_index


@pytest.mark.asyncio
async def test_finalize_before_enqueue_leaves_queue_reschedulable(monkeypatch):
    queue = _queue_domain()
    idle = _queue_row(
        runner_state="idle",
        runner_command_id=None,
        scheduling_token=None,
        scheduling_expires_at=None,
        lease_owner=None,
        lease_expires_at=None,
    )
    query = AsyncMock(
        side_effect=[
            [{"outcome": "finalized", "queue": idle}],
            [_item_row(status="pending", stream_revision=idle["revision"] + 1)],
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    result = await queue.ChatQueueRepository.finalize_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker-a",
        command_id="command:one",
    )
    item = await queue.ChatQueueRepository.enqueue(
        chat_session_id="chat_session:session-a",
        client_request_id="after-finalize",
        prompt="Schedule a new runner",
    )

    assert result.outcome == "finalized"
    assert result.queue is not None
    assert result.queue.runner_state == "idle"
    assert item.status == "pending"
    finalize_sql = " ".join(query.await_args_list[0].args[0].split())
    enqueue_sql = " ".join(query.await_args_list[1].args[0].split())
    assert "COMMIT TRANSACTION" in finalize_sql
    assert "revision += 1" in enqueue_sql
    assert "stream_revision: $updated_queue.revision" in enqueue_sql


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "pending_count"),
    [("paused", 1), ("active", 0)],
)
async def test_finalize_clears_paused_or_drained_queue(
    monkeypatch, status, pending_count
):
    queue = _queue_domain()
    idle = _queue_row(
        status=status,
        runner_state="idle",
        runner_command_id=None,
        scheduling_token=None,
        scheduling_expires_at=None,
        lease_owner=None,
        lease_expires_at=None,
    )
    query = AsyncMock(return_value=[{"outcome": "finalized", "queue": idle}])
    monkeypatch.setattr(queue, "repo_query", query)

    result = await queue.ChatQueueRepository.finalize_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker-a",
        command_id=None,
    )

    assert result.outcome == "finalized"
    assert result.finalized is True
    assert result.should_continue is False
    assert result.queue is not None
    assert result.queue.runner_state == "idle"
    statement = " ".join(query.await_args.args[0].split())
    assert "$queue.status = 'active'" in statement
    assert "array::len($pending) > 0" in statement


@pytest.mark.asyncio
async def test_finalize_with_stale_owner_is_a_noop(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(return_value=[{"outcome": "stale"}])
    monkeypatch.setattr(queue, "repo_query", query)

    result = await queue.ChatQueueRepository.finalize_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker:stale",
        command_id=None,
    )

    assert result.outcome == "stale"
    assert result.queue is None
    assert result.finalized is False
    assert result.should_continue is False


@pytest.mark.asyncio
async def test_claim_selects_the_lowest_pending_item(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(return_value=[_item_row(status="running", current_loop=1)])
    monkeypatch.setattr(queue, "repo_query", query)

    claimed = await queue.ChatQueueRepository.claim_next(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        lease_owner="worker-a",
    )

    assert claimed is not None
    assert claimed.status == "running"
    statement = query.await_args.args[0]
    assert "ORDER BY position ASC" in statement
    assert "LIMIT 1" in statement
    assert "BEGIN TRANSACTION" in statement
    assert "status = 'pending'" in statement
    assert "blocking_failed" not in statement
    assert "position <= $next.position" not in statement


@pytest.mark.asyncio
async def test_retry_failed_item_resets_execution_state(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(
        return_value=[
            _item_row(
                status="pending",
                current_loop=0,
                stream_revision=0,
                error_message=None,
            )
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    item = await queue.ChatQueueRepository.retry_failed(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
    )

    assert item.status == "pending"
    assert item.current_loop == 0
    assert item.stream_revision == 0
    variables = query.await_args.args[1]
    assert variables["failed_status"] == "failed"
    assert variables["pending_status"] == "pending"


def test_api_queue_models_trim_and_bound_enqueue_input():
    models = import_module("api.models")
    request_type = getattr(models, "ChatQueueItemEnqueueRequest")

    request = request_type(
        client_request_id="request-a",
        prompt="  Explain the schedule  ",
        loop_count=10,
        model_id="model:gpt",
    )

    assert request.prompt == "Explain the schedule"
    assert request.loop_count == 10

    with pytest.raises(ValidationError):
        request_type(client_request_id="request-b", prompt=" ", loop_count=1)
    with pytest.raises(ValidationError):
        request_type(client_request_id="request-c", prompt="x", loop_count=11)
    with pytest.raises(ValidationError):
        request_type(
            client_request_id="request-d",
            prompt="x" * 100_001,
            loop_count=1,
        )


def test_update_request_rejects_explicit_null_core_fields():
    models = import_module("api.models")

    with pytest.raises(ValidationError):
        models.ChatQueueItemUpdateRequest(prompt=None)
    with pytest.raises(ValidationError):
        models.ChatQueueItemUpdateRequest(loop_count=None)


def test_update_request_preserves_omitted_vs_cleared_selectors():
    models = import_module("api.models")

    omitted = models.ChatQueueItemUpdateRequest(prompt="Revised")
    cleared = models.ChatQueueItemUpdateRequest(model_id=None, skill_ids=None)

    assert omitted.selector_patch() == {}
    assert cleared.selector_patch() == {"model_id": None, "skill_ids": None}


def test_collision_safe_reorder_positions_follow_non_pending_items():
    queue = _queue_domain()

    plan = queue.plan_pending_positions(
        pending_count=2,
        maximum_all_position=50,
        maximum_non_pending_position=50,
    )

    assert plan.temporary == [1_000_050, 1_000_051]
    assert plan.final == [60, 70]
    assert not set(plan.temporary) & {10, 20, 50}
    assert not set(plan.final) & {10, 20, 50}


@pytest.mark.asyncio
async def test_update_uses_valid_scoped_transaction_and_snapshot_merge(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(
        return_value=[
            _item_row(
                prompt="Revised",
                loop_count=3,
                execution_snapshot={"model_id": None, "skill_ids": ["skill:a"]},
            )
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    await queue.ChatQueueRepository.update_item(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        prompt="Revised",
        loop_count=3,
        selector_patch={"model_id": None, "skill_ids": ["skill:a"]},
    )

    statement, variables = query.await_args.args
    normalized = " ".join(statement.split())
    assert "MERGE $updates WHERE" not in normalized
    assert "SET updated" not in normalized
    assert "object::extend(" not in normalized
    assert "execution_snapshot + $selector_patch" in normalized
    assert "queue_id = $queue_id" in normalized
    assert "chat_session = $chat_session" in normalized
    assert "current_loop <= $loop_count" in normalized
    assert "revision += 1" in normalized
    assert variables["selector_patch"] == {
        "model_id": None,
        "skill_ids": ["skill:a"],
    }


@pytest.mark.asyncio
async def test_update_rejects_loop_reduction_below_progress(monkeypatch):
    queue = _queue_domain()
    monkeypatch.setattr(queue, "repo_query", AsyncMock(return_value=[]))

    with pytest.raises(queue.ChatQueueMutationError):
        await queue.ChatQueueRepository.update_item(
            item_id="chat_queue_item:item-a",
            queue_id="chat_queue:queue-a",
            chat_session_id="chat_session:session-a",
            loop_count=1,
        )


@pytest.mark.asyncio
async def test_reorder_uses_collision_safe_bases_and_revision_bump(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(return_value=[_queue_row(revision=5)])
    monkeypatch.setattr(queue, "repo_query", query)

    await queue.ChatQueueRepository.reorder_pending(
        "chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        item_ids=["chat_queue_item:b", "chat_queue_item:a"],
        expected_revision=4,
    )

    statement = " ".join(query.await_args.args[0].split())
    assert "maximum_all_position" in statement
    assert "maximum_non_pending_position" in statement
    assert "temporary_base" in statement
    assert "final_base" in statement
    assert "chat_session = $chat_session" in statement
    assert "revision += 1" in statement


@pytest.mark.asyncio
async def test_claim_adopts_running_before_selecting_pending(monkeypatch):
    queue = _queue_domain()
    state = {
        "running": None,
        "pending": [
            _item_row(status="pending", current_loop=0),
            _item_row(
                id="chat_queue_item:item-b",
                client_request_id="request-b",
                run_id="run-b",
                position=20,
                status="pending",
                current_loop=0,
            ),
        ],
    }
    statements = []

    async def claim_from_state(statement, variables):
        statements.append(statement)
        if state["running"] is None:
            claimed = state["pending"].pop(0)
            claimed.update(
                status="running",
                current_loop=1,
                iteration_token=f"{claimed['run_id']}/1",
            )
            state["running"] = claimed
        return [state["running"]]

    monkeypatch.setattr(queue, "repo_query", claim_from_state)

    first = await queue.ChatQueueRepository.claim_next(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        lease_owner="worker-a",
    )
    adopted = await queue.ChatQueueRepository.claim_next(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        lease_owner="worker-a",
    )

    assert first is not None
    assert adopted is not None
    assert first.id == adopted.id == "chat_queue_item:item-a"
    assert len(state["pending"]) == 1
    statement = " ".join(statements[0].split())
    running_lookup = statement.index("status = 'running'")
    pending_lookup = statement.index("status = 'pending'")
    assert running_lookup < pending_lookup
    assert "IF $running != NONE" in statement
    assert "chat_session = $chat_session" in statement


@pytest.mark.asyncio
async def test_complete_iteration_compare_and_set_rejects_duplicate(monkeypatch):
    queue = _queue_domain()
    state = _item_row(
        status="running",
        loop_count=3,
        current_loop=1,
        iteration_token="run-a/1",
        stream_revision=1,
    )
    calls = []

    async def complete_from_state(statement, variables):
        calls.append((statement, variables))
        if (
            state["current_loop"] != variables["expected_loop"]
            or state["iteration_token"] != variables["iteration_token"]
        ):
            return []
        state["current_loop"] += 1
        state["iteration_token"] = variables["next_iteration_token"]
        state["stream_revision"] += 1
        return [dict(state)]

    monkeypatch.setattr(queue, "repo_query", complete_from_state)

    await queue.ChatQueueRepository.complete_loop_iteration(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        run_id="run-a",
        lease_owner="worker-a",
        expected_loop=1,
        iteration_token="run-a/1",
    )
    with pytest.raises(queue.ChatQueueMutationError):
        await queue.ChatQueueRepository.complete_loop_iteration(
            item_id="chat_queue_item:item-a",
            queue_id="chat_queue:queue-a",
            chat_session_id="chat_session:session-a",
            run_id="run-a",
            lease_owner="worker-a",
            expected_loop=1,
            iteration_token="run-a/1",
        )

    statement, variables = calls[0]
    normalized = " ".join(statement.split())
    assert "current_loop = $expected_loop" in normalized
    assert "iteration_token = $iteration_token" in normalized
    assert "queue_id = $queue_id" in normalized
    assert "chat_session = $chat_session" in normalized
    assert variables["expected_loop"] == 1


@pytest.mark.asyncio
async def test_stream_snapshot_compare_and_set_rejects_delayed_write(monkeypatch):
    queue = _queue_domain()
    state = _item_row(
        status="running",
        current_loop=1,
        iteration_token="run-a/1",
        stream_revision=3,
        stream_content="older",
    )
    queue_revision = 100
    calls = []

    async def stream_from_state(statement, variables):
        nonlocal queue_revision
        calls.append((statement, variables))
        queue_revision += 1
        state["stream_revision"] = queue_revision
        state["stream_content"] = variables["content"]
        return [dict(state)]

    monkeypatch.setattr(queue, "repo_query", stream_from_state)

    await queue.ChatQueueRepository.mark_stream_progress(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        run_id="run-a",
        lease_owner="worker-a",
        expected_revision=3,
        content="newest",
    )
    await queue.ChatQueueRepository.mark_stream_progress(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        run_id="run-a",
        lease_owner="worker-a",
        expected_revision=3,
        content="later",
    )

    assert state["stream_revision"] == 102
    assert state["stream_content"] == "later"
    statement, variables = calls[0]
    normalized = " ".join(statement.split())
    assert "BEGIN TRANSACTION" in normalized
    assert "revision += 1" in normalized
    assert "stream_revision = $queue.revision" in normalized
    assert "status = 'running'" in normalized
    assert "RETURN $updated" in normalized
    assert "stream_revision = $expected_revision" not in normalized
    assert variables["expected_revision"] == 3


@pytest.mark.parametrize(
    "method_name",
    [
        "update_item",
        "delete_item",
        "retry_failed",
        "mark_stream_progress",
        "complete_loop_iteration",
        "fail_item_and_pause",
        "cleanup_terminal_items",
    ],
)
def test_item_mutations_require_queue_and_session_ownership(method_name):
    queue = _queue_domain()
    parameters = signature(getattr(queue.ChatQueueRepository, method_name)).parameters

    assert "queue_id" in parameters
    assert "chat_session_id" in parameters


@pytest.mark.parametrize(
    "method_name",
    [
        "update_item",
        "reorder_pending",
        "claim_next",
        "mark_stream_progress",
        "complete_loop_iteration",
        "fail_item_and_pause",
        "retry_failed",
    ],
)
def test_item_mutations_assign_the_global_queue_revision(method_name):
    queue = _queue_domain()
    source = getsource(getattr(queue.ChatQueueRepository, method_name))

    assert "revision += 1" in source
    assert "stream_revision = $queue.revision" in source


@pytest.mark.parametrize(
    "method_name",
    [
        "pause",
        "resume",
        "acquire_lease",
        "renew_lease",
        "finalize_runner",
        "reserve_runner",
        "confirm_runner_command",
        "reset_runner_reservation",
        "clear_unleased_schedule",
    ],
)
def test_queue_mutations_increment_the_global_revision(method_name):
    queue = _queue_domain()
    source = getsource(getattr(queue.ChatQueueRepository, method_name))

    assert "revision += 1" in source


@pytest.mark.asyncio
async def test_mutations_bump_queue_revision_in_same_transaction(monkeypatch):
    queue = _queue_domain()
    calls = []

    async def capture(statement, variables):
        calls.append(" ".join(statement.split()))
        if "CREATE ONLY $item_id" in statement:
            return [_item_row()]
        if "DELETE $item_id" in statement:
            return [_item_row()]
        if "status = $pending_status" in statement:
            return [_item_row(status="pending")]
        return [_item_row(prompt="Updated")]

    monkeypatch.setattr(queue, "repo_query", capture)

    await queue.ChatQueueRepository.enqueue(
        chat_session_id="chat_session:session-a",
        client_request_id="request-a",
        prompt="Queued",
    )
    await queue.ChatQueueRepository.update_item(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        prompt="Updated",
    )
    await queue.ChatQueueRepository.delete_item(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
    )
    await queue.ChatQueueRepository.retry_failed(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
    )

    assert all("BEGIN TRANSACTION" in statement for statement in calls)
    assert all("revision += 1" in statement for statement in calls)


@pytest.mark.asyncio
async def test_runner_reservation_recovers_stale_and_excludes_fresh(monkeypatch):
    queue = _queue_domain()
    now = datetime.now(timezone.utc)
    query = AsyncMock(
        side_effect=[
            [
                _queue_row(
                    runner_state="scheduled",
                    scheduling_token="token:new",
                    scheduling_expires_at=now + timedelta(seconds=30),
                )
            ],
            [],
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    scheduled = await queue.ChatQueueRepository.reserve_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        scheduling_token="token:new",
        ttl_seconds=30,
    )
    assert scheduled.runner_state == "scheduled"
    assert scheduled.scheduling_token == "token:new"

    with pytest.raises(queue.ChatQueueMutationError):
        await queue.ChatQueueRepository.reserve_runner(
            queue_id="chat_queue:queue-a",
            chat_session_id="chat_session:session-a",
            scheduling_token="token:blocked",
            ttl_seconds=30,
        )

    normalized = " ".join(query.await_args_list[0].args[0].split())
    assert "scheduling_expires_at <= time::now()" in normalized
    assert "scheduling_token = $scheduling_token" in normalized
    assert "scheduling_expires_at = time::now() + type::duration($ttl)" in normalized
    assert "runner_state = 'scheduled'" in normalized
    assert "runner_state = 'scheduled' AND runner_command_id = NONE" not in normalized
    assert "chat_session = $chat_session" in normalized


@pytest.mark.asyncio
async def test_reserve_runner_recovers_stale_lease_but_excludes_fresh_lease(
    monkeypatch,
):
    queue = _queue_domain()
    reserved = _queue_row(
        runner_state="scheduled",
        runner_command_id=None,
        scheduling_token="token:new",
        scheduling_expires_at=datetime.now(timezone.utc) + timedelta(seconds=30),
        lease_owner=None,
        lease_expires_at=None,
    )
    query = AsyncMock(side_effect=[[reserved], []])
    monkeypatch.setattr(queue, "repo_query", query)

    recovered = await queue.ChatQueueRepository.reserve_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        scheduling_token="token:new",
        ttl_seconds=30,
    )
    with pytest.raises(queue.ChatQueueMutationError):
        await queue.ChatQueueRepository.reserve_runner(
            queue_id="chat_queue:queue-a",
            chat_session_id="chat_session:session-a",
            scheduling_token="token:blocked",
            ttl_seconds=30,
        )

    assert recovered.scheduling_token == "token:new"
    normalized = " ".join(query.await_args_list[0].args[0].split())
    assert "runner_state = 'running'" in normalized
    assert "lease_expires_at <= time::now()" in normalized
    assert "lease_owner = NONE" in normalized
    assert "lease_expires_at = NONE" in normalized


@pytest.mark.asyncio
async def test_runner_finalization_is_reusable_and_stale_safe(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(
        side_effect=[
            [
                {
                    "outcome": "finalized",
                    "queue": _queue_row(
                        runner_state="idle",
                        runner_command_id=None,
                        lease_owner=None,
                        lease_expires_at=None,
                    ),
                }
            ],
            [
                _item_row(
                    status="failed",
                    runner_state="failed",
                    error_type="provider",
                    error_message="Provider failed",
                )
            ],
            [
                {
                    "outcome": "finalized",
                    "queue": _queue_row(
                        status="paused",
                        runner_state="idle",
                        runner_command_id=None,
                        lease_owner=None,
                        lease_expires_at=None,
                    ),
                }
            ],
            [{"outcome": "stale"}],
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    released = await queue.ChatQueueRepository.release_lease(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker-a",
        command_id="command:one",
    )
    failed_item = await queue.ChatQueueRepository.fail_item_and_pause(
        item_id="chat_queue_item:item-a",
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        run_id="run-a",
        lease_owner="worker-a",
        error_type="provider",
        error_message="Provider failed",
    )
    failed_release = await queue.ChatQueueRepository.finalize_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker-a",
        command_id="command:one",
    )
    stale_release = await queue.ChatQueueRepository.finalize_runner(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        owner="worker-a",
        command_id="command:old",
    )

    assert released is True
    assert failed_item.status == "failed"
    assert failed_release.finalized is True
    assert failed_release.queue is not None
    assert failed_release.queue.status == "paused"
    assert stale_release.outcome == "stale"
    assert stale_release.queue is None
    normalized = " ".join(query.await_args_list[0].args[0].split())
    assert "runner_state = 'idle'" in normalized
    assert "runner_command_id = NONE" in normalized
    assert "lease_owner = NONE" in normalized
    assert "lease_expires_at = NONE" in normalized
    assert "runner_command_id = $command_id" in normalized
    assert "lease_owner = $owner" in normalized
    assert "chat_session = $chat_session" in normalized
    failure_statement = " ".join(query.await_args_list[1].args[0].split())
    assert "revision += 1" in failure_statement
    assert "status = 'paused'" not in failure_statement
    assert "runner_command_id = NONE" not in failure_statement


@pytest.mark.asyncio
async def test_atomic_session_delete_guards_running_and_deletes_all(monkeypatch):
    queue = _queue_domain()
    query = AsyncMock(
        side_effect=[
            [{"outcome": "running"}],
            [{"outcome": "deleted"}],
        ]
    )
    monkeypatch.setattr(queue, "repo_query", query)

    with pytest.raises(queue.ChatQueueMutationError, match="running"):
        await queue.ChatQueueRepository.delete_session_if_idle("chat_session:session-a")
    deleted = await queue.ChatQueueRepository.delete_session_if_idle(
        "chat_session:session-a"
    )

    assert deleted is True
    statement = " ".join(query.await_args_list[0].args[0].split())
    assert "BEGIN TRANSACTION" in statement
    assert "status = 'running'" in statement
    assert "DELETE chat_queue_item" in statement
    assert "DELETE chat_queue" in statement
    assert "DELETE $chat_session" in statement
    assert statement.index("status = 'running'") < statement.index(
        "DELETE chat_queue_item"
    )


def test_migration_36_defines_queue_contract_and_is_registered():
    root = Path(__file__).resolve().parents[1]
    migration = root / "construction_os" / "database" / "migrations" / "36.surrealql"
    rollback = (
        root / "construction_os" / "database" / "migrations" / "36_down.surrealql"
    )

    assert migration.exists()
    assert rollback.exists()

    sql = migration.read_text(encoding="utf-8")
    for required_term in (
        "chat_queue",
        "chat_queue_item",
        "chat_session",
        "client_request_id",
        "run_id",
        "loop_count",
        "next_position",
        "scheduling_token",
        "scheduling_expires_at",
        "execution_snapshot",
        "lease_owner",
        "runner_command_id",
        "iteration_token",
        "stream_revision",
        "stream_content",
        "stream_progress",
        "stream_activity",
        "error_message",
    ):
        assert required_term in sql

    manager_source = (
        root / "construction_os" / "database" / "async_migrate.py"
    ).read_text(encoding="utf-8")
    assert "migrations/36.surrealql" in manager_source
    assert "migrations/36_down.surrealql" in manager_source

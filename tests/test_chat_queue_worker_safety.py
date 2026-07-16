"""Critical persistence and lifecycle regressions for chat queue workers."""

from __future__ import annotations

import asyncio
import inspect
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import aiosqlite
import pytest
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from construction_os.chat import queue_runner
from construction_os.domain import chat_queue
from construction_os.mcp import allowlist as allowlist_module


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("connection", "risk_level", "message"),
    [
        (None, "read", "connection"),
        (SimpleNamespace(id="mcp_connection:c", status="error"), "read", "unavailable"),
        (
            SimpleNamespace(id="mcp_connection:c", status="connected"),
            "action",
            "read-only",
        ),
    ],
)
async def test_selected_mcp_tool_requires_available_connection_and_read_risk(
    monkeypatch,
    connection,
    risk_level,
    message,
):
    """Queued selected tools fail validation instead of being silently dropped."""
    tool = SimpleNamespace(
        id="mcp_tool:search",
        available=True,
        connection="mcp_connection:c",
        risk_level=risk_level,
    )
    monkeypatch.setattr(queue_runner.McpTool, "get", AsyncMock(return_value=tool))
    monkeypatch.setattr(
        queue_runner.McpConnection,
        "get",
        AsyncMock(return_value=connection),
    )

    with pytest.raises(queue_runner.QueueItemValidationError, match=message):
        await queue_runner.QueueExecutionResolver()._validate_tools(["mcp_tool:search"])


@pytest.mark.asyncio
async def test_selected_readonly_mcp_tool_with_connected_connection_is_valid(
    monkeypatch,
):
    """Execution validation accepts only the existing read-only allowlist case."""
    tool = SimpleNamespace(
        id="mcp_tool:search",
        available=True,
        connection="mcp_connection:c",
        risk_level="read",
    )
    connection = SimpleNamespace(id="mcp_connection:c", status="connected")
    monkeypatch.setattr(queue_runner.McpTool, "get", AsyncMock(return_value=tool))
    monkeypatch.setattr(
        queue_runner.McpConnection,
        "get",
        AsyncMock(return_value=connection),
    )

    await queue_runner.QueueExecutionResolver()._validate_tools(["mcp_tool:search"])


@pytest.mark.asyncio
async def test_strict_runtime_allowlist_never_drops_a_selected_queued_tool(
    monkeypatch,
):
    """Queue execution receives an explicit error if a selected tool disappears."""
    monkeypatch.setattr(
        allowlist_module.McpTool,
        "get",
        AsyncMock(side_effect=RuntimeError("tool disappeared")),
    )

    with pytest.raises(allowlist_module.McpToolSelectionError, match="mcp_tool:gone"):
        await allowlist_module.build_allowlist(
            ["mcp_tool:gone"],
            strict_selected_tools=True,
        )


@pytest.mark.parametrize(
    ("method_name", "minimum_expiry_guards"),
    [
        ("claim_next", 2),
        ("mark_stream_progress", 2),
        ("complete_loop_iteration", 2),
        ("fail_item_and_pause", 2),
        ("finalize_runner", 2),
    ],
)
def test_every_worker_mutation_rechecks_owner_and_unexpired_lease(
    method_name,
    minimum_expiry_guards,
):
    """Each worker-owned write is guarded at the mutation, not only preflight."""
    source = inspect.getsource(getattr(chat_queue.ChatQueueRepository, method_name))

    assert source.count("lease_owner") >= minimum_expiry_guards
    assert source.count("lease_expires_at > time::now()") >= minimum_expiry_guards


def test_queue_models_are_split_and_reexported_below_growth_threshold():
    """Queue models remain import-compatible without a monolithic repository file."""
    models_path = Path(chat_queue.__file__).with_name("chat_queue_models.py")
    assert models_path.exists()
    assert chat_queue.ChatQueue.__module__.endswith("chat_queue_models")
    assert chat_queue.ChatQueueItem.__module__.endswith("chat_queue_models")
    assert (
        len(Path(chat_queue.__file__).read_text(encoding="utf-8").splitlines()) < 1400
    )
    assert len(models_path.read_text(encoding="utf-8").splitlines()) < 600


def test_two_sequential_event_loops_own_and_close_sqlite_checkpointers(tmp_path):
    """Repeated command loops can setup, compile, and close local checkpointers."""
    database_path = tmp_path / "worker-checkpoints.sqlite"

    async def open_compile_close() -> None:
        connection = await aiosqlite.connect(database_path)
        try:
            saver = AsyncSqliteSaver(connection)
            await saver.setup()
            project_graph = queue_runner.chat_graph_module.compile_graph(saver)
            source_graph = queue_runner.source_chat_module.compile_graph(saver)
            assert project_graph.checkpointer is saver
            assert source_graph.checkpointer is saver
        finally:
            await connection.close()

    asyncio.run(open_compile_close())
    asyncio.run(open_compile_close())


@pytest.mark.asyncio
async def test_only_matching_pending_orphan_start_is_retryable():
    """A matching reservation with pending work remains a recoverable failure."""

    class OrphanRepository:
        async def acquire_lease(self, **kwargs):
            return None

        async def get_for_session(self, chat_session_id):
            return SimpleNamespace(
                chat_session=chat_session_id,
                runner_state="scheduled",
                scheduling_token="matching-token",
                lease_owner=None,
                lease_expires_at=None,
            )

        async def list_visible_items(self, queue_id):
            return [SimpleNamespace(status="pending")]

    runner = queue_runner.ChatQueueRunner(
        repository=OrphanRepository(),
        project_agent=MagicMock(),
        source_agent=MagicMock(),
        lease_renew_interval_seconds=0,
    )

    with pytest.raises(queue_runner.ChatQueueLeaseUnavailable):
        await runner.drain(
            chat_session_id="chat_session:s",
            queue_id="chat_queue:q",
            scheduling_token="matching-token",
            command_id="command:retry",
        )

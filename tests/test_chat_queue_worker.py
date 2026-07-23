"""State-machine tests for persistent chat queue background execution."""

from __future__ import annotations

import asyncio
import inspect
from datetime import datetime, timedelta, timezone
from importlib import import_module
from importlib.util import find_spec
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from ag_ui.core import (
    CustomEvent,
    EventType,
    RunErrorEvent,
    RunFinishedEvent,
    TextMessageContentEvent,
)
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver

from construction_os.domain.chat_queue import (
    ChatQueue,
    ChatQueueItem,
    RunnerFinalizationResult,
)


def _worker_module():
    """Load Task 3's runner after asserting that it exists."""
    try:
        spec = find_spec("construction_os.chat.queue_runner")
    except ModuleNotFoundError:
        spec = None
    assert spec is not None, (
        "construction_os.chat.queue_runner has not been implemented"
    )
    return import_module("construction_os.chat.queue_runner")


def _runtime_module():
    """Load Task 3's reusable AG-UI runtime after asserting that it exists."""
    spec = find_spec("construction_os.graphs.ag_ui_runtime")
    assert spec is not None, (
        "construction_os.graphs.ag_ui_runtime has not been implemented"
    )
    return import_module("construction_os.graphs.ag_ui_runtime")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _queue(**overrides) -> ChatQueue:
    values = {
        "id": "chat_queue:queue-a",
        "chat_session": "chat_session:session-a",
        "status": "active",
        "revision": 1,
        "next_position": 20,
        "runner_state": "scheduled",
        "runner_command_id": "command:worker-a",
        "scheduling_token": "schedule-a",
        "scheduling_expires_at": _now(),
        "lease_owner": None,
        "lease_expires_at": None,
        "created": _now(),
        "updated": _now(),
    }
    values.update(overrides)
    return ChatQueue(**values)


def _item(**overrides) -> ChatQueueItem:
    values = {
        "id": "chat_queue_item:item-a",
        "queue_id": "chat_queue:queue-a",
        "chat_session": "chat_session:session-a",
        "client_request_id": "request-a",
        "run_id": "chat-queue-run-item-a",
        "position": 10,
        "status": "pending",
        "visible": True,
        "prompt": "Summarize the project",
        "loop_count": 1,
        "current_loop": 0,
        "iteration_token": None,
        "execution_snapshot": {
            "model_id": "model:gpt",
            "skill_ids": ["skill:estimating"],
            "tool_ids": ["mcp_tool:search"],
            "html_template_id": "html_template:bid",
            "artifact_id": "artifact:summary",
            "context_config": {
                "sources": {"source:plans": "Full Content"},
                "notes": {"note:scope": "Full Content"},
            },
            "forwarded_props": {"client_marker": "immutable"},
        },
        "runner_command_id": "command:worker-a",
        "runner_state": "idle",
        "stream_revision": 1,
        "stream_content": "",
        "stream_progress": None,
        "stream_activity": None,
        "error_type": None,
        "error_message": None,
        "error_details": None,
        "started_at": None,
        "completed_at": None,
        "failed_at": None,
        "created": _now(),
        "updated": _now(),
    }
    values.update(overrides)
    return ChatQueueItem(**values)


class StatefulRepository:
    """Stateful repository fake preserving lease, claim, loop, and revision rules."""

    def __init__(self, items: list[ChatQueueItem], *, pause_after_completion=False):
        self.queue = _queue()
        self.items = items
        self.pause_after_completion = pause_after_completion
        self.acquire_denied = False
        self.calls: list[str] = []
        self.stream_writes: list[dict] = []
        self.failed: list[tuple[str, str]] = []
        self.renew_results: list[bool] = []
        self.finalize_results: list[str] = []
        self.finalize_command_ids: list[str | None] = []

    async def acquire_lease(self, **kwargs):
        self.calls.append("acquire")
        if (
            self.acquire_denied
            or kwargs["scheduling_token"] != self.queue.scheduling_token
        ):
            return None
        self.queue.runner_state = "running"
        self.queue.lease_owner = kwargs["owner"]
        self.queue.revision += 1
        return self.queue

    async def renew_lease(self, **kwargs):
        self.calls.append("renew")
        result = self.renew_results.pop(0) if self.renew_results else True
        if not result or self.queue.lease_owner != kwargs["owner"]:
            return None
        self.queue.revision += 1
        return self.queue

    async def claim_next(self, **kwargs):
        self.calls.append("claim")
        running = next((item for item in self.items if item.status == "running"), None)
        if running is not None:
            return running
        if self.queue.status != "active":
            return None
        pending = next((item for item in self.items if item.status == "pending"), None)
        if pending is None:
            return None
        pending.status = "running"
        pending.current_loop = 1
        pending.iteration_token = f"{pending.run_id}/1"
        pending.runner_state = "running"
        self.queue.revision += 1
        pending.stream_revision = self.queue.revision
        return pending

    async def mark_stream_progress(self, **kwargs):
        self.calls.append("stream")
        item = next(item for item in self.items if item.id == kwargs["item_id"])
        if item.status != "running" or self.queue.lease_owner != kwargs["lease_owner"]:
            raise RuntimeError("Stream update rejected because the run is not active")
        self.queue.revision += 1
        item.stream_revision = self.queue.revision
        item.stream_content = kwargs["content"]
        item.stream_progress = kwargs["progress"]
        item.stream_activity = kwargs["activity"]
        self.stream_writes.append(dict(kwargs))
        return item

    async def complete_loop_iteration(self, **kwargs):
        self.calls.append("complete")
        item = next(item for item in self.items if item.id == kwargs["item_id"])
        assert item.current_loop == kwargs["expected_loop"]
        assert item.iteration_token == kwargs["iteration_token"]
        self.queue.revision += 1
        item.stream_revision = self.queue.revision
        if item.current_loop == item.loop_count:
            item.status = "completed"
            item.runner_state = "completed"
            item.iteration_token = None
        else:
            item.current_loop += 1
            item.iteration_token = f"{item.run_id}/{item.current_loop}"
            item.stream_content = ""
            item.stream_progress = None
            item.stream_activity = None
        if self.pause_after_completion:
            self.queue.status = "paused"
        return item

    async def fail_item_and_pause(self, **kwargs):
        self.calls.append("fail")
        item = next(item for item in self.items if item.id == kwargs["item_id"])
        item.status = "failed"
        item.runner_state = "failed"
        item.error_type = kwargs["error_type"]
        item.error_message = kwargs["error_message"]
        item.iteration_token = None
        # Play/pause is user-controlled; failures leave the queue active.
        self.failed.append((kwargs["error_type"], kwargs["error_message"]))
        return item

    async def get_for_session(self, chat_session_id):
        self.calls.append("get_queue")
        return self.queue if self.queue.chat_session == chat_session_id else None

    async def list_visible_items(self, queue_id):
        self.calls.append("list_items")
        return [
            item for item in self.items if item.visible and item.queue_id == queue_id
        ]

    async def finalize_runner(self, **kwargs):
        self.calls.append("finalize")
        self.finalize_command_ids.append(kwargs["command_id"])
        if self.finalize_results:
            outcome = self.finalize_results.pop(0)
        else:
            has_pending = any(item.status == "pending" for item in self.items)
            outcome = (
                "continue"
                if self.queue.status == "active" and has_pending
                else "finalized"
            )
        if outcome == "finalized":
            self.queue.runner_state = "idle"
            self.queue.lease_owner = None
            self.queue.scheduling_token = None
        return RunnerFinalizationResult(outcome=outcome, queue=self.queue)


class FakeGraph:
    """Checkpoint fake whose messages are updated by the event iterator."""

    def __init__(self, messages=None):
        self.messages = list(messages or [])
        self.state_calls = 0

    async def aget_state(self, config):
        self.state_calls += 1
        return SimpleNamespace(values={"messages": list(self.messages)})


class FakeAgent:
    """Agent fake exposing its local graph for checkpoint inspection."""

    def __init__(self, graph: FakeGraph, scope: str):
        self.graph = graph
        self.scope = scope


class StaticResolver:
    """Execution resolver fake returning scope-specific immutable payloads."""

    def __init__(self, scope="project"):
        self.scope = scope
        self.calls: list[tuple[str, str]] = []

    async def resolve(self, chat_session_id, item):
        self.calls.append((chat_session_id, str(item.id)))
        forwarded = {
            "session_id": chat_session_id,
            f"{self.scope}_id": f"{self.scope}:target-a",
            "client_marker": item.execution_snapshot.get("forwarded_props", {}).get(
                "client_marker"
            ),
        }
        return SimpleNamespace(
            scope=self.scope,
            forwarded_props=forwarded,
            configurable={"model_id": item.execution_snapshot.get("model_id")},
        )


class EventScript:
    """Raw AG-UI iterator fake that records inputs and persists checkpoint turns."""

    def __init__(self, scripts):
        self.scripts = list(scripts)
        self.calls = []

    async def __call__(self, agent, run_input, *, configurable=None):
        self.calls.append((agent, run_input, configurable))
        human = run_input.messages[-1]
        existing = next(
            (
                index
                for index, message in enumerate(agent.graph.messages)
                if getattr(message, "id", None) == human.id
            ),
            None,
        )
        if existing is None:
            agent.graph.messages.append(
                HumanMessage(content=human.content, id=human.id)
            )
        else:
            agent.graph.messages[existing] = HumanMessage(
                content=human.content, id=human.id
            )
        events = self.scripts.pop(0)
        for event in events:
            yield event
        if not any(
            getattr(event, "type", None) == EventType.RUN_ERROR for event in events
        ):
            agent.graph.messages.append(AIMessage(content="answer", id="ai-result"))


def _runner(repository, script, graph=None, resolver=None, **kwargs):
    worker = _worker_module()
    graph = graph or FakeGraph()
    resolver = resolver or StaticResolver()
    return worker.ChatQueueRunner(
        repository=repository,
        project_agent=FakeAgent(graph, "project"),
        resolver=resolver,
        event_iterator=script,
        lease_ttl_seconds=60,
        lease_renew_interval_seconds=0,
        snapshot_interval_seconds=kwargs.pop("snapshot_interval_seconds", 0),
        sleep=kwargs.pop("sleep", AsyncMock()),
        **kwargs,
    )


def test_task3_modules_exist():
    """Task 3 starts with reusable runtime and worker modules."""
    assert _runtime_module() is not None
    assert _worker_module() is not None


@pytest.mark.asyncio
async def test_runtime_clones_configures_and_yields_raw_events():
    """The non-HTTP runtime clones agents and returns event objects unchanged."""
    runtime = _runtime_module()
    event = RunErrorEvent(type=EventType.RUN_ERROR, message="provider failed")
    clone = SimpleNamespace(config={"configurable": {"thread_id": "original"}})
    clone.run = MagicMock()

    async def run(_input):
        yield event

    clone.run.side_effect = run
    agent = SimpleNamespace(clone=MagicMock(return_value=clone))
    run_input = runtime.build_run_input(thread_id="chat_session:a", message="Hello")

    observed = [
        item
        async for item in runtime.iterate_agent_events(
            agent,
            run_input,
            configurable={"model_id": "model:gpt"},
        )
    ]

    assert observed == [event]
    assert observed[0] is event
    assert clone.config["configurable"] == {
        "thread_id": "original",
        "model_id": "model:gpt",
    }
    agent.clone.assert_called_once_with()


def test_http_adapter_preserves_runtime_exports_and_has_no_inline_ag_ui_imports():
    """Existing routers can keep importing helpers from the HTTP adapter."""
    adapter = import_module("api.ag_ui_agents")
    runtime = _runtime_module()

    for name in (
        "build_user_message",
        "build_run_input",
        "iterate_agent_events",
        "project_chat_agent",
    ):
        assert hasattr(adapter, name)
    assert adapter.build_run_input is runtime.build_run_input
    assert "from ag_ui" not in inspect.getsource(adapter.stream_agent_events)


def test_graph_compile_factories_do_not_mutate_api_globals():
    """Worker-local graph compilation leaves API process globals untouched."""
    chat = import_module("construction_os.graphs.chat")
    checkpointer = MemorySaver()
    original_project = chat.graph

    local_project = chat.compile_graph(checkpointer)

    assert local_project is not original_project
    assert chat.graph is original_project


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["project"])
async def test_default_resolver_builds_direct_sse_equivalent_forwarded_payloads(
    monkeypatch, scope
):
    """Queued execution forwards the same resolved fields as direct SSE routes."""
    worker = _worker_module()
    target_id = f"{scope}:target-a"
    target = SimpleNamespace(
        id=target_id,
        name="Project A",
        description="Description",
    )
    template = SimpleNamespace(
        id="html_template:bid",
        name="Bid",
        category="estimate",
        html_body="<html>{{image:logo}}</html>",
    )
    artifact = SimpleNamespace(
        id="artifact:summary",
        name="summary",
        title="Summary",
        description="Summarize",
        prompt="Do it",
    )
    model = SimpleNamespace(id="model:gpt", type="language")
    skill = SimpleNamespace(id="skill:estimating", archived=False)
    tool = SimpleNamespace(
        id="mcp_tool:search",
        available=True,
        connection="mcp_connection:search",
        risk_level="read",
    )
    connection = SimpleNamespace(
        id="mcp_connection:search",
        status="connected",
    )
    monkeypatch.setattr(
        worker,
        "repo_query",
        AsyncMock(return_value=[{"out": target_id}]),
    )
    monkeypatch.setattr(worker.Project, "get", AsyncMock(return_value=target))
    monkeypatch.setattr(worker.Model, "get", AsyncMock(return_value=model))
    monkeypatch.setattr(worker.Skill, "get", AsyncMock(return_value=skill))
    monkeypatch.setattr(worker.McpTool, "get", AsyncMock(return_value=tool))
    monkeypatch.setattr(
        worker.McpConnection,
        "get",
        AsyncMock(return_value=connection),
    )
    monkeypatch.setattr(worker.HtmlTemplate, "get", AsyncMock(return_value=template))
    monkeypatch.setattr(worker.ArtifactTemplate, "get", AsyncMock(return_value=artifact))
    monkeypatch.setattr(
        worker,
        "get_project_scope_ids",
        AsyncMock(return_value=({"source:plans"}, {"note:scope"})),
    )
    monkeypatch.setattr(
        worker,
        "expand_image_tokens",
        AsyncMock(return_value="<html><img src='logo'></html>"),
    )
    item = _item()

    resolved = await worker.QueueExecutionResolver().resolve(
        "chat_session:session-a", item
    )

    assert resolved.scope == scope
    assert resolved.forwarded_props["session_id"] == "chat_session:session-a"
    assert resolved.forwarded_props["model_override"] == "model:gpt"
    assert resolved.forwarded_props["skill_ids"] == ["skill:estimating"]
    assert resolved.forwarded_props["mcp_tool_ids"] == ["mcp_tool:search"]
    assert resolved.forwarded_props["strict_mcp_tools"] is True
    assert resolved.forwarded_props["html_template"]["html_body"].startswith(
        "<html><img"
    )
    assert resolved.forwarded_props["client_marker"] == "immutable"
    assert resolved.forwarded_props["project"] == {
        "id": "project:target-a",
        "name": "Project A",
        "description": "Description",
    }
    assert resolved.forwarded_props["artifact"]["id"] == "artifact:summary"
    assert resolved.forwarded_props["context_config"]["sources"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("missing_kind", "snapshot_patch", "expected"),
    [
        ("model", {}, "model:gpt"),
        ("skill", {}, "skill:estimating"),
        ("tool", {}, "mcp_tool:search"),
        ("template", {}, "html_template:bid"),
        ("artifact", {}, "artifact:summary"),
        (
            "context",
            {
                "context_config": {
                    "sources": {"source:deleted": "Full Content"},
                    "notes": {},
                }
            },
            "source:deleted",
        ),
    ],
)
async def test_deleted_snapshot_references_are_rejected(
    monkeypatch, missing_kind, snapshot_patch, expected
):
    """Immutable selectors fail explicitly if their referenced resource was deleted."""
    worker = _worker_module()
    monkeypatch.setattr(
        worker,
        "repo_query",
        AsyncMock(return_value=[{"out": "project:target-a"}]),
    )
    monkeypatch.setattr(
        worker.Project,
        "get",
        AsyncMock(return_value=SimpleNamespace(id="project:target-a", name="P")),
    )
    monkeypatch.setattr(
        worker.Model,
        "get",
        AsyncMock(return_value=SimpleNamespace(id="model:gpt", type="language")),
    )
    monkeypatch.setattr(
        worker.Skill,
        "get",
        AsyncMock(return_value=SimpleNamespace(id="skill:estimating", archived=False)),
    )
    monkeypatch.setattr(
        worker.McpTool,
        "get",
        AsyncMock(
            return_value=SimpleNamespace(
                id="mcp_tool:search",
                available=True,
                connection="mcp_connection:search",
                risk_level="read",
            )
        ),
    )
    monkeypatch.setattr(
        worker.McpConnection,
        "get",
        AsyncMock(
            return_value=SimpleNamespace(
                id="mcp_connection:search",
                status="connected",
            )
        ),
    )
    monkeypatch.setattr(
        worker.HtmlTemplate,
        "get",
        AsyncMock(
            return_value=SimpleNamespace(
                id="html_template:bid",
                name="Bid",
                category="estimate",
                html_body="<html></html>",
            )
        ),
    )
    monkeypatch.setattr(
        worker.ArtifactTemplate,
        "get",
        AsyncMock(
            return_value=SimpleNamespace(
                id="artifact:summary",
                name="summary",
                title="Summary",
                description="Summary",
                prompt="Summary",
            )
        ),
    )
    monkeypatch.setattr(
        worker, "expand_image_tokens", AsyncMock(return_value="<html/>")
    )
    monkeypatch.setattr(
        worker,
        "get_project_scope_ids",
        AsyncMock(return_value=({"source:plans"}, {"note:scope"})),
    )
    missing_map = {
        "model": worker.Model,
        "skill": worker.Skill,
        "tool": worker.McpTool,
        "template": worker.HtmlTemplate,
        "artifact": worker.ArtifactTemplate,
    }
    if missing_kind in missing_map:
        monkeypatch.setattr(
            missing_map[missing_kind], "get", AsyncMock(return_value=None)
        )
    item = _item()
    item.execution_snapshot.update(snapshot_patch)

    with pytest.raises(worker.QueueItemValidationError, match=expected):
        await worker.QueueExecutionResolver().resolve("chat_session:session-a", item)


def test_stable_human_message_ids_are_item_iteration_and_token_scoped():
    """Every claim token gets a stable replay ID without colliding across retries."""
    worker = _worker_module()

    assert worker.stable_human_message_id("chat_queue_item:a", 1, "tok-a") == (
        worker.stable_human_message_id("chat_queue_item:a", 1, "tok-a")
    )
    assert worker.stable_human_message_id("chat_queue_item:a", 1, "tok-a") != (
        worker.stable_human_message_id("chat_queue_item:a", 2, "tok-a")
    )
    assert worker.stable_human_message_id("chat_queue_item:a", 1, "tok-a") != (
        worker.stable_human_message_id("chat_queue_item:b", 1, "tok-a")
    )
    assert worker.stable_human_message_id("chat_queue_item:a", 1, "tok-a") != (
        worker.stable_human_message_id("chat_queue_item:a", 1, "tok-b")
    )


@pytest.mark.parametrize(
    ("messages", "expected"),
    [
        ([], "execute"),
        (
            [
                HumanMessage(content="prompt", id="stable"),
                AIMessage(content="answer", id="ai"),
            ],
            "completed",
        ),
        ([HumanMessage(content="prompt", id="stable")], "resume"),
    ],
)
def test_checkpoint_recovery_classifies_new_completed_and_human_only(
    messages, expected
):
    """Checkpoint inspection decides whether to execute, complete, or resume."""
    worker = _worker_module()

    assert worker.inspect_checkpoint_turn(messages, "stable") == expected


@pytest.mark.parametrize(
    "messages",
    [
        [AIMessage(content="wrong role", id="stable")],
        [
            HumanMessage(content="one", id="stable"),
            HumanMessage(content="duplicate", id="stable"),
        ],
        [
            HumanMessage(content="prompt", id="stable"),
            HumanMessage(content="unexpected", id="other"),
        ],
    ],
)
def test_checkpoint_recovery_rejects_ambiguous_state(messages):
    """Ambiguous replay state must pause instead of creating a duplicate turn."""
    worker = _worker_module()

    with pytest.raises(worker.AmbiguousCheckpointError):
        worker.inspect_checkpoint_turn(messages, "stable")


@pytest.mark.asyncio
async def test_raw_events_accumulate_throttle_and_final_flush():
    """Raw AG-UI deltas and progress persist through throttled CAS snapshots."""
    repository = StatefulRepository([_item()])
    events = [
        TextMessageContentEvent(message_id="ai", delta="Hello "),
        CustomEvent(
            name="agent_progress",
            value={
                "phase": "progress",
                "step": "retrieving_context",
                "detail": {"sourceCount": 1},
            },
        ),
        TextMessageContentEvent(message_id="ai", delta="world"),
        RunFinishedEvent(thread_id="chat_session:session-a", run_id="run-a"),
    ]
    script = EventScript([events])
    runner = _runner(
        repository,
        script,
        snapshot_interval_seconds=3600,
    )

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    # Seed flush after claim, then final flush after the (throttled) event stream.
    assert len(repository.stream_writes) == 2
    assert repository.stream_writes[0]["content"] == ""
    final = repository.stream_writes[-1]
    assert final["content"] == "Hello world"
    assert final["progress"]["step"] == "retrieving_context"
    assert final["activity"]["events"]
    assert final["expected_revision"] < repository.items[0].stream_revision


@pytest.mark.asyncio
async def test_sequential_loops_use_stable_ids_in_one_thread_without_duplicates():
    """Loop iterations execute serially on the same thread and complete once each."""
    item = _item(loop_count=3)
    repository = StatefulRepository([item])
    graph = FakeGraph()
    scripts = [
        [
            TextMessageContentEvent(message_id=f"ai-{index}", delta=str(index)),
            RunFinishedEvent(thread_id="chat_session:session-a", run_id=f"run-{index}"),
        ]
        for index in range(1, 4)
    ]
    script = EventScript(scripts)
    runner = _runner(repository, script, graph=graph)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    human_ids = [call[1].messages[-1].id for call in script.calls]
    assert len(script.calls) == 3
    assert len(set(human_ids)) == 3
    assert all(call[1].thread_id == "chat_session:session-a" for call in script.calls)
    assert item.status == "completed"
    assert repository.calls.count("complete") == 3
    assert len([message for message in graph.messages if message.type == "human"]) == 3


@pytest.mark.asyncio
async def test_pause_after_current_iteration_leaves_next_loop_adoptable():
    """A pause requested mid-item is honored only after the current iteration."""
    item = _item(loop_count=2)
    repository = StatefulRepository([item], pause_after_completion=True)
    script = EventScript(
        [
            [
                TextMessageContentEvent(message_id="ai", delta="done"),
                RunFinishedEvent(thread_id="chat_session:session-a", run_id="run-a"),
            ]
        ]
    )
    runner = _runner(repository, script)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert len(script.calls) == 1
    assert item.status == "running"
    assert item.current_loop == 2
    assert repository.queue.status == "paused"
    assert repository.calls[-1] == "finalize"


@pytest.mark.asyncio
async def test_existing_running_item_is_adopted_before_pending_item():
    """Recovery resumes the sole running item before claiming later work."""
    running = _item(
        status="running",
        current_loop=1,
        iteration_token="chat-queue-run-item-a/1",
        runner_state="running",
    )
    pending = _item(
        id="chat_queue_item:item-b",
        run_id="chat-queue-run-item-b",
        client_request_id="request-b",
        position=20,
        prompt="Second",
    )
    repository = StatefulRepository([running, pending])
    script = EventScript(
        [
            [RunFinishedEvent(thread_id="chat_session:session-a", run_id="running")],
            [RunFinishedEvent(thread_id="chat_session:session-a", run_id="pending")],
        ]
    )
    resolver = StaticResolver()
    runner = _runner(repository, script, resolver=resolver)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert [item_id for _, item_id in resolver.calls] == [
        "chat_queue_item:item-a",
        "chat_queue_item:item-b",
    ]
    assert all(item.status == "completed" for item in repository.items)


@pytest.mark.asyncio
async def test_checkpoint_completed_iteration_advances_without_replaying():
    """A persisted human+AI pair completes the CAS without invoking the agent."""
    item = _item(
        status="running",
        current_loop=1,
        iteration_token="chat-queue-run-item-a/1",
        runner_state="running",
    )
    worker = _worker_module()
    stable_id = worker.stable_human_message_id(str(item.id), 1, item.iteration_token)
    graph = FakeGraph(
        [
            HumanMessage(content=item.prompt, id=stable_id),
            AIMessage(content="already done", id="ai"),
        ]
    )
    repository = StatefulRepository([item])
    script = EventScript([])
    runner = _runner(repository, script, graph=graph)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert script.calls == []
    assert item.status == "completed"
    assert repository.calls.count("complete") == 1


@pytest.mark.asyncio
async def test_checkpoint_human_only_resumes_by_replacing_same_id():
    """A crash after human persistence reuses the same ID and creates no duplicate."""
    item = _item(
        status="running",
        current_loop=1,
        iteration_token="chat-queue-run-item-a/1",
        runner_state="running",
    )
    worker = _worker_module()
    stable_id = worker.stable_human_message_id(str(item.id), 1, item.iteration_token)
    graph = FakeGraph([HumanMessage(content=item.prompt, id=stable_id)])
    repository = StatefulRepository([item])
    script = EventScript(
        [[RunFinishedEvent(thread_id="chat_session:session-a", run_id="resumed")]]
    )
    runner = _runner(repository, script, graph=graph)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert script.calls[0][1].messages[-1].id == stable_id
    assert (
        len(
            [
                message
                for message in graph.messages
                if getattr(message, "id", None) == stable_id
            ]
        )
        == 1
    )
    assert item.status == "completed"


@pytest.mark.asyncio
async def test_ambiguous_checkpoint_fails_item_without_pausing_or_agent_call():
    """Unsafe replay state is terminal for the item and never duplicates a turn."""
    item = _item(
        status="running",
        current_loop=1,
        iteration_token="chat-queue-run-item-a/1",
        runner_state="running",
    )
    worker = _worker_module()
    stable_id = worker.stable_human_message_id(str(item.id), 1, item.iteration_token)
    graph = FakeGraph([AIMessage(content="wrong", id=stable_id)])
    repository = StatefulRepository([item])
    script = EventScript([])
    runner = _runner(repository, script, graph=graph)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert script.calls == []
    assert item.status == "failed"
    assert repository.queue.status == "active"
    assert repository.failed[0][0] == "AmbiguousCheckpointError"


@pytest.mark.asyncio
async def test_run_error_fails_item_and_finalizes_without_pausing():
    """AG-UI RUN_ERROR is persisted as failure rather than a successful turn."""
    item = _item()
    repository = StatefulRepository([item])
    script = EventScript(
        [[RunErrorEvent(type=EventType.RUN_ERROR, message="Provider unavailable")]]
    )
    runner = _runner(repository, script)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert item.status == "failed"
    assert repository.queue.status == "active"
    assert repository.failed == [("AgentRunError", "Provider unavailable")]
    assert repository.calls[-1] == "finalize"


@pytest.mark.asyncio
async def test_lease_is_acquired_before_claim_and_renewed_during_events():
    """The runner owns and renews its lease before mutating an item."""
    repository = StatefulRepository([_item()])
    renew_gate = asyncio.Event()

    async def yielding_events(agent, run_input, *, configurable=None):
        await renew_gate.wait()
        yield RunFinishedEvent(thread_id="chat_session:session-a", run_id="renewed")

    async def immediate_sleep(_seconds):
        if repository.calls.count("renew") == 0:
            renew_gate.set()
        await asyncio.sleep(0)

    worker = _worker_module()
    graph = FakeGraph()
    runner = worker.ChatQueueRunner(
        repository=repository,
        project_agent=FakeAgent(graph, "project"),
        resolver=StaticResolver(),
        event_iterator=yielding_events,
        lease_ttl_seconds=60,
        lease_renew_interval_seconds=0.001,
        snapshot_interval_seconds=0,
        sleep=immediate_sleep,
    )

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert repository.calls.index("acquire") < repository.calls.index("claim")
    assert "renew" in repository.calls


@pytest.mark.asyncio
async def test_lease_loss_stops_without_failing_or_finalizing_foreign_work():
    """A lost lease aborts this worker without writing under a new owner."""
    worker = _worker_module()
    repository = StatefulRepository([_item()])
    repository.renew_results = [False]
    renew_gate = asyncio.Event()

    async def blocked_events(agent, run_input, *, configurable=None):
        await renew_gate.wait()
        yield RunFinishedEvent(thread_id="chat_session:session-a", run_id="late")

    async def immediate_sleep(_seconds):
        renew_gate.set()
        await asyncio.sleep(0)

    graph = FakeGraph()
    runner = worker.ChatQueueRunner(
        repository=repository,
        project_agent=FakeAgent(graph, "project"),
        resolver=StaticResolver(),
        event_iterator=blocked_events,
        lease_ttl_seconds=60,
        lease_renew_interval_seconds=0.001,
        snapshot_interval_seconds=0,
        sleep=immediate_sleep,
    )

    with pytest.raises(worker.ChatQueueLeaseLost):
        await runner.drain(
            chat_session_id="chat_session:session-a",
            queue_id="chat_queue:queue-a",
            scheduling_token="schedule-a",
            command_id="command:worker-a",
        )

    assert repository.failed == []
    assert "finalize" not in repository.calls


@pytest.mark.asyncio
async def test_finalization_continue_race_reenters_claim_loop():
    """An enqueue racing with drain finalization keeps the same runner working."""
    first = _item()
    second = _item(
        id="chat_queue_item:item-b",
        run_id="chat-queue-run-item-b",
        client_request_id="request-b",
        position=20,
        prompt="Raced enqueue",
        status="completed",
    )
    repository = StatefulRepository([first, second])
    repository.finalize_results = ["continue", "finalized"]

    async def inject_race(agent, run_input, *, configurable=None):
        if first.status == "running":
            yield RunFinishedEvent(thread_id="chat_session:session-a", run_id="first")
            second.status = "pending"
        else:
            yield RunFinishedEvent(thread_id="chat_session:session-a", run_id="second")

    runner = _runner(repository, inject_race)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert first.status == "completed"
    assert second.status == "completed"
    assert repository.calls.count("finalize") == 2


@pytest.mark.asyncio
async def test_worker_checkpointer_is_command_scoped_and_always_closed(monkeypatch):
    """Each command builds local graphs and closes its own SQLite connection."""
    worker = _worker_module()
    connection = SimpleNamespace(
        row_factory=None,
        execute=AsyncMock(),
        commit=AsyncMock(),
        close=AsyncMock(),
    )
    saver = SimpleNamespace(setup=AsyncMock())
    project_graph = SimpleNamespace(name="local-project")
    project_agent = SimpleNamespace(name="project-agent")
    drain = AsyncMock()
    monkeypatch.setattr(worker.aiosqlite, "connect", AsyncMock(return_value=connection))
    monkeypatch.setattr(worker, "AsyncSqliteSaver", MagicMock(return_value=saver))
    monkeypatch.setattr(
        worker.chat_graph_module,
        "compile_graph",
        MagicMock(return_value=project_graph),
    )
    monkeypatch.setattr(
        worker,
        "build_agent",
        MagicMock(return_value=project_agent),
    )
    monkeypatch.setattr(worker.ChatQueueRunner, "drain", drain)
    api_project_graph = worker.chat_graph_module.graph

    await worker.run_chat_queue_worker(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    saver.setup.assert_awaited_once()
    statements = [call.args[0] for call in connection.execute.await_args_list]
    assert any("busy_timeout" in statement for statement in statements)
    assert any("journal_mode=WAL" in statement for statement in statements)
    drain.assert_awaited_once()
    connection.close.assert_awaited_once()
    assert worker.chat_graph_module.graph is api_project_graph


@pytest.mark.asyncio
async def test_worker_crash_closes_checkpointer_and_propagates_for_command_retry(
    monkeypatch,
):
    """Infrastructure crashes escape for retry after local SQLite cleanup."""
    worker = _worker_module()
    connection = SimpleNamespace(
        row_factory=None,
        execute=AsyncMock(),
        commit=AsyncMock(),
        close=AsyncMock(),
    )
    saver = SimpleNamespace(setup=AsyncMock())
    monkeypatch.setattr(worker.aiosqlite, "connect", AsyncMock(return_value=connection))
    monkeypatch.setattr(worker, "AsyncSqliteSaver", MagicMock(return_value=saver))
    monkeypatch.setattr(
        worker.chat_graph_module,
        "compile_graph",
        MagicMock(return_value=SimpleNamespace()),
    )
    monkeypatch.setattr(
        worker, "build_agent", MagicMock(return_value=SimpleNamespace())
    )
    monkeypatch.setattr(
        worker.ChatQueueRunner,
        "drain",
        AsyncMock(side_effect=RuntimeError("worker process crashed")),
    )

    with pytest.raises(RuntimeError, match="worker process crashed"):
        await worker.run_chat_queue_worker(
            chat_session_id="chat_session:session-a",
            queue_id="chat_queue:queue-a",
            scheduling_token="schedule-a",
            command_id="command:worker-a",
        )

    connection.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_acquire_before_late_confirmation_keeps_same_scheduling_identity(
    monkeypatch,
):
    """The Task 2 reservation supports a worker starting before API confirmation."""
    domain = import_module("construction_os.domain.chat_queue")
    acquired = _queue(
        runner_state="running",
        runner_command_id=None,
        scheduling_token="schedule-a",
        lease_owner="chat-queue-worker:command:worker-a",
    ).model_dump(mode="python")
    confirmed = dict(acquired)
    confirmed["runner_command_id"] = "command:worker-a"
    query = AsyncMock(side_effect=[[acquired], [confirmed]])
    monkeypatch.setattr(domain, "repo_query", query)

    leased = await domain.ChatQueueRepository.acquire_lease(
        queue_id="chat_queue:queue-a",
        owner="chat-queue-worker:command:worker-a",
        scheduling_token="schedule-a",
        ttl_seconds=60,
    )
    bound = await domain.ChatQueueRepository.confirm_runner_command(
        queue_id="chat_queue:queue-a",
        chat_session_id="chat_session:session-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert leased is not None
    assert bound is not None
    assert bound.runner_command_id == "command:worker-a"
    assert bound.scheduling_token == "schedule-a"


@pytest.mark.asyncio
async def test_finish_before_confirmation_finalizes_without_unbound_command_guard():
    """A fast worker can finalize safely before API command confirmation arrives."""
    repository = StatefulRepository([_item()])
    repository.queue.runner_command_id = None
    script = EventScript(
        [[RunFinishedEvent(thread_id="chat_session:session-a", run_id="fast-worker")]]
    )
    runner = _runner(repository, script)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert repository.finalize_command_ids == [None]


def test_drain_command_is_registered_sync_validated_and_retryable():
    """The command validates IDs, bridges one event loop, and retries only recovery."""
    commands = import_module("commands.chat_queue_commands")
    package = import_module("commands")
    source = inspect.getsource(commands)

    assert hasattr(package, "drain_chat_queue_command")
    assert not inspect.iscoroutinefunction(commands.drain_chat_queue_command)
    assert "asyncio.run" in source
    assert "drain_chat_queue" in source
    assert "'max_attempts':" in source or '"max_attempts":' in source
    assert not source.lstrip().startswith("from __future__ import annotations")
    with pytest.raises(Exception):
        commands.DrainChatQueueInput(
            chat_session_id="project:not-a-session",
            queue_id="chat_queue:q",
            runner_token="token",
        )
    with pytest.raises(Exception):
        commands.DrainChatQueueInput(
            chat_session_id="chat_session:s",
            queue_id="source:not-a-queue",
            runner_token="token",
        )


def test_drain_command_submit_schema_is_fully_defined():
    """surreal-commands must validate drain args without a Pydantic rebuild error."""
    from surreal_commands.core.registry import CommandRegistry

    import_module("commands")
    command = CommandRegistry().get_command("construction_os", "drain_chat_queue")
    validated = command.input_schema(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        runner_token="schedule-token",
    )
    dumped = validated.model_dump(mode="json")
    assert dumped["chat_session_id"] == "chat_session:session-a"
    assert dumped["queue_id"] == "chat_queue:queue-a"
    assert dumped["runner_token"] == "schedule-token"


def test_worker_files_stay_below_repository_size_limit():
    """New production and test files remain below the 1600-line hard limit."""
    worker = _worker_module()
    runtime = _runtime_module()

    for path in (
        inspect.getsourcefile(worker),
        inspect.getsourcefile(runtime),
        __file__,
    ):
        assert path is not None
        with open(path, encoding="utf-8") as file:
            assert sum(1 for _ in file) < 1600


def test_heartbeat_interval_must_be_shorter_than_lease_ttl():
    """A worker cannot be configured to renew at or after lease expiry."""
    worker = _worker_module()

    with pytest.raises(ValueError, match="shorter than"):
        worker.ChatQueueRunner(
            project_agent=MagicMock(),
            lease_ttl_seconds=10,
            lease_renew_interval_seconds=10,
        )


@pytest.mark.asyncio
async def test_renewal_exception_interrupts_silent_event_stream_immediately():
    """Heartbeat failures close a silent model stream and surface typed lease loss."""
    worker = _worker_module()
    stream_closed = asyncio.Event()

    class FailingRenewalRepository:
        async def renew_lease(self, **kwargs):
            raise RuntimeError("database unavailable")

    async def no_wait(_seconds):
        await asyncio.sleep(0)

    async def silent_events(*_args, **_kwargs):
        try:
            await asyncio.Event().wait()
            yield None
        finally:
            stream_closed.set()

    runner = worker.ChatQueueRunner(
        repository=FailingRenewalRepository(),
        project_agent=MagicMock(),
        event_iterator=silent_events,
        lease_ttl_seconds=10,
        lease_renew_interval_seconds=1,
        sleep=no_wait,
    )
    stop = asyncio.Event()
    heartbeat = asyncio.create_task(runner._renew_lease("chat_queue:q", "owner", stop))

    with pytest.raises(worker.ChatQueueLeaseLost) as error:
        await asyncio.wait_for(
            anext(runner._events_until_lease_loss(MagicMock(), MagicMock(), {})),
            timeout=1,
        )

    await heartbeat
    assert stream_closed.is_set()
    assert isinstance(error.value.__cause__, RuntimeError)
    assert "database unavailable" in str(error.value.__cause__)


def test_checkpoint_tool_suffix_requires_one_terminal_answer():
    """A completed replay may contain complete tool cycles and one final answer."""
    worker = _worker_module()
    human_id = "stable-human"
    messages = [
        HumanMessage(content="question", id=human_id),
        AIMessage(
            content="",
            id="tool-request",
            tool_calls=[
                {
                    "name": "search",
                    "args": {"q": "cost"},
                    "id": "call-1",
                    "type": "tool_call",
                }
            ],
        ),
        ToolMessage(content="result", tool_call_id="call-1"),
        AIMessage(content="Final answer", id="answer"),
    ]

    recovery = worker.inspect_checkpoint_turn(messages, human_id)

    assert recovery == "completed"
    assert recovery.final_content == "Final answer"


@pytest.mark.parametrize(
    "suffix",
    [
        [
            AIMessage(content="First answer", id="answer-1"),
            AIMessage(content="Second answer", id="answer-2"),
        ],
        [
            AIMessage(
                content="",
                id="tool-request",
                tool_calls=[
                    {
                        "name": "search",
                        "args": {},
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            )
        ],
        [ToolMessage(content="orphan", tool_call_id="call-1")],
        [AIMessage(content="answer", id="answer"), HumanMessage(content="other")],
    ],
)
def test_checkpoint_ambiguous_suffixes_are_rejected(suffix):
    """Incomplete, duplicate, or reordered suffixes cannot be replayed safely."""
    worker = _worker_module()
    human_id = "stable-human"

    with pytest.raises(worker.AmbiguousCheckpointError):
        worker.inspect_checkpoint_turn(
            [HumanMessage(content="question", id=human_id), *suffix],
            human_id,
        )


@pytest.mark.asyncio
async def test_checkpoint_completed_recovery_flushes_final_content_before_completion():
    """A crash after checkpoint persistence restores the final reconnect snapshot."""
    item = _item(
        status="running",
        current_loop=1,
        iteration_token="chat-queue-run-item-a/1",
    )
    repository = StatefulRepository([item])
    message_id = _worker_module().stable_human_message_id(
        str(item.id), 1, item.iteration_token
    )
    graph = FakeGraph(
        [
            HumanMessage(content="Summarize", id=message_id),
            AIMessage(content="Recovered final answer", id="ai-final"),
        ]
    )
    runner = _runner(repository, EventScript([]), graph=graph)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert repository.stream_writes
    assert repository.stream_writes[-1]["content"] == "Recovered final answer"
    assert repository.calls.index("stream") < repository.calls.index("complete")


@pytest.mark.asyncio
async def test_mapping_events_use_the_same_field_extraction_as_models():
    """Raw mapping events persist content, progress, and errors consistently."""
    repository = StatefulRepository([_item()])
    script = EventScript(
        [
            [
                {"type": EventType.TEXT_MESSAGE_CONTENT.value, "delta": "mapped"},
                {
                    "type": EventType.CUSTOM.value,
                    "name": "agent_progress",
                    "value": {"label": "Searching"},
                },
                {"type": EventType.RUN_FINISHED.value},
            ]
        ]
    )
    runner = _runner(repository, script)

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="schedule-a",
        command_id="command:worker-a",
    )

    assert repository.stream_writes[-1]["content"] == "mapped"
    assert repository.stream_writes[-1]["progress"] == {"label": "Searching"}


@pytest.mark.asyncio
async def test_retry_after_finalization_is_an_idempotent_noop():
    """A command retry after finalization does not fail or touch queue items."""
    repository = StatefulRepository([])
    repository.acquire_denied = True
    repository.queue.runner_state = "idle"
    repository.queue.scheduling_token = None
    repository.queue.lease_owner = None
    repository.queue.lease_expires_at = None
    runner = _runner(repository, EventScript([]))

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="old-schedule",
        command_id="command:worker-a",
    )

    assert repository.calls == ["acquire", "get_queue"]


@pytest.mark.asyncio
async def test_retry_for_newer_reservation_is_an_idempotent_noop():
    """An old command cannot interfere with a newer scheduling reservation."""
    repository = StatefulRepository([_item()])
    repository.acquire_denied = True
    repository.queue.scheduling_token = "new-schedule"
    repository.queue.lease_owner = "new-owner"
    repository.queue.lease_expires_at = _now() + timedelta(minutes=1)
    runner = _runner(repository, EventScript([]))

    await runner.drain(
        chat_session_id="chat_session:session-a",
        queue_id="chat_queue:queue-a",
        scheduling_token="old-schedule",
        command_id="command:old-worker",
    )

    assert repository.items[0].status == "pending"
    assert repository.calls == ["acquire", "get_queue"]

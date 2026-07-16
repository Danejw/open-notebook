"""Tests for native Construction OS chat capabilities."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import ValidationError

from construction_os.capabilities.authz import require_project_artifact_save
from construction_os.capabilities.langchain_bridge import build_native_langchain_tools
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.capabilities.project_artifacts import (
    SaveProjectArtifactInput,
    save_project_artifact,
)
from construction_os.capabilities.registry import (
    NATIVE_TOOL_NAMES,
    get_native_tool_definition,
    list_native_tool_definitions,
    runtime_name,
)
from construction_os.exceptions import InvalidInputError
from construction_os.graphs.chat_intent import requests_project_artifact_save
from construction_os.skills.standard import normalize_relative_path
from construction_os.tool_runtime.chat_loop import generate_with_tools
from construction_os.tool_runtime.execution import DuplicateCallGuard


def _ctx(**overrides) -> CapabilityRuntimeContext:
    base = dict(
        project_id="project:1",
        session_id="chat_session:1",
        message_id="msg-1",
        allow_project_artifact_save=True,
        enable_native_tools=True,
    )
    base.update(overrides)
    return CapabilityRuntimeContext(**base)


def test_all_fourteen_native_tools_registered():
    defs = list_native_tool_definitions()
    assert len(defs) == 14
    assert set(NATIVE_TOOL_NAMES) == {d.name for d in defs}
    assert "list_output_templates" in NATIVE_TOOL_NAMES
    assert "get_output_template" in NATIVE_TOOL_NAMES
    assert "list_artifact_templates" in NATIVE_TOOL_NAMES
    assert "get_artifact_template" in NATIVE_TOOL_NAMES
    assert "list_templates" not in NATIVE_TOOL_NAMES
    assert "get_templates" not in NATIVE_TOOL_NAMES
    for name in NATIVE_TOOL_NAMES:
        tool = get_native_tool_definition(name)
        assert tool is not None
        assert issubclass(tool.input_model, object)
        schema = tool.input_model.model_json_schema()
        assert isinstance(schema, dict)


def test_runtime_context_uses_list_factories():
    a = CapabilityRuntimeContext(project_id="p:1", session_id="s:1")
    b = CapabilityRuntimeContext(project_id="p:2", session_id="s:2")
    a.ephemeral_skill_ids.append("skill:1")
    assert b.ephemeral_skill_ids == []


def test_write_gate_rejects_without_flag():
    ctx = _ctx(allow_project_artifact_save=False)
    with pytest.raises(InvalidInputError):
        require_project_artifact_save(ctx)


@pytest.mark.parametrize(
    "message,expected",
    [
        ("Please save this as a project artifact", True),
        ("Save this to the project", True),
        ("create a project artifact from that", True),
        ("What is retainage?", False),
        ("hello", False),
    ],
)
def test_requests_project_artifact_save_heuristic(message: str, expected: bool):
    assert requests_project_artifact_save(message) is expected


def test_skill_path_traversal_rejected():
    with pytest.raises(Exception):
        normalize_relative_path("../secrets.txt")


def test_save_bound_only_when_write_gate_open():
    ctx_open = _ctx(allow_project_artifact_save=True)
    ctx_closed = _ctx(allow_project_artifact_save=False)
    open_tools = {t.name for t in build_native_langchain_tools(ctx_open)}
    closed_tools = {t.name for t in build_native_langchain_tools(ctx_closed)}
    assert runtime_name("save_project_artifact") in open_tools
    assert runtime_name("save_project_artifact") not in closed_tools
    assert runtime_name("get_project_context") in closed_tools


def test_guest_gets_no_native_tools():
    ctx = _ctx(is_guest=True, enable_native_tools=False)
    assert build_native_langchain_tools(ctx) == []


@pytest.mark.asyncio
async def test_save_project_artifact_idempotent():
    ctx = _ctx()
    inputs = SaveProjectArtifactInput(
        content="Hello artifact",
        title="T",
        artifact_kind="manual",
        idempotency_key="key-1",
    )
    first = {
        "id": "note:1",
        "title": "T",
        "content": "Hello artifact",
        "artifact_kind": "manual",
        "note_type": "manual",
        "created": "t",
        "updated": "t",
        "command_id": None,
        "idempotent_replay": False,
    }
    second = {**first, "idempotent_replay": True}
    with patch(
        "construction_os.capabilities.project_artifacts.create_project_artifact",
        new_callable=AsyncMock,
        side_effect=[first, second],
    ) as mock_create, patch(
        "construction_os.capabilities.project_artifacts.require_project_session",
        new_callable=AsyncMock,
    ):
        out1 = await save_project_artifact(ctx, inputs, tool_call_id="tc-1")
        out2 = await save_project_artifact(ctx, inputs, tool_call_id="tc-1")
    assert out1.created is True
    assert out2.created is False
    assert mock_create.await_count == 2


@pytest.mark.asyncio
async def test_save_rejected_when_gate_closed():
    ctx = _ctx(allow_project_artifact_save=False)
    with patch(
        "construction_os.capabilities.project_artifacts.require_project_session",
        new_callable=AsyncMock,
    ), pytest.raises(InvalidInputError):
        await save_project_artifact(
            ctx,
            SaveProjectArtifactInput(content="x", artifact_kind="manual"),
        )


@pytest.mark.asyncio
async def test_get_skill_does_not_mutate_session_fields():
    from construction_os.capabilities.skills import GetSkillInput, get_skill

    ctx = _ctx(explicit_skill_ids=["skill:existing"])
    with patch(
        "construction_os.capabilities.skills.require_project_session",
        new_callable=AsyncMock,
    ), patch(
        "construction_os.capabilities.skills.load_one_skill_md",
        new_callable=AsyncMock,
        return_value={
            "id": "skill:new",
            "name": "New",
            "block": "## Skill",
            "char_count": 10,
        },
    ):
        await get_skill(ctx, GetSkillInput(skill_id="skill:new"))
    assert ctx.explicit_skill_ids == ["skill:existing"]
    assert "skill:new" in ctx.ephemeral_skill_ids


@pytest.mark.asyncio
async def test_mixed_native_and_mcp_loop_binds_both():
    mock_model = MagicMock()
    mock_model.bind_tools.return_value = mock_model
    mock_model.invoke.return_value = AIMessage(content="done")
    provision = AsyncMock(return_value=mock_model)
    ctx = _ctx(allow_project_artifact_save=False)

    native_tool = MagicMock()
    native_tool.name = "native__get_project_context"
    mcp_tool = MagicMock()
    mcp_tool.name = "mcp__c__echo"

    with patch(
        "construction_os.tool_runtime.chat_loop.build_allowlist",
        new_callable=AsyncMock,
        return_value=MagicMock(),
    ), patch(
        "construction_os.tool_runtime.chat_loop.build_native_langchain_tools",
        return_value=[native_tool],
    ), patch(
        "construction_os.tool_runtime.chat_loop.build_langchain_tools",
        return_value=[mcp_tool],
    ):
        result = await generate_with_tools(
            provision_model=provision,
            payload=[HumanMessage(content="Hi")],
            model_id=None,
            mcp_tool_ids=["tool:1"],
            session_id="chat_session:1",
            message_id="msg-1",
            capability_context=ctx,
        )

    bound = mock_model.bind_tools.call_args[0][0]
    names = {t.name for t in bound}
    assert "native__get_project_context" in names
    assert "mcp__c__echo" in names
    assert result.content == "done"


def test_duplicate_call_guard_blocks_repeats():
    guard = DuplicateCallGuard()
    assert guard.check_and_record("native__list_skills", {"query": "a"}) is False
    assert guard.check_and_record("native__list_skills", {"query": "a"}) is True


def test_save_input_requires_content():
    with pytest.raises(ValidationError):
        SaveProjectArtifactInput(content="")

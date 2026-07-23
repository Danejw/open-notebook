"""Tests for AG-UI assistant text emit helpers used after tool turns."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from construction_os.graphs.progress import (
    AGENT_PROGRESS_EVENT,
    CITATION_REMOVED_IDS_CAP,
    MANUALLY_EMIT_MESSAGE_EVENT,
    emit_assistant_text_message,
    emit_citation_verify_progress,
)


def test_emit_assistant_text_message_dispatches_payload():
    with patch(
        "construction_os.graphs.progress.dispatch_custom_event"
    ) as mock_dispatch:
        assert (
            emit_assistant_text_message(
                message_id="ai-1",
                message="  Final answer  ",
                config={"callbacks": []},
            )
            is True
        )

    mock_dispatch.assert_called_once()
    args, kwargs = mock_dispatch.call_args
    assert args[0] == MANUALLY_EMIT_MESSAGE_EVENT
    assert args[1] == {"message_id": "ai-1", "message": "Final answer"}
    assert kwargs.get("config") is not None


def test_emit_assistant_text_message_noop_without_text_or_config():
    with patch(
        "construction_os.graphs.progress.dispatch_custom_event"
    ) as mock_dispatch:
        assert (
            emit_assistant_text_message(
                message_id="ai-1",
                message="   ",
                config={"callbacks": []},
            )
            is False
        )
        assert (
            emit_assistant_text_message(
                message_id="ai-1",
                message="Hello",
                config=None,
            )
            is False
        )
    mock_dispatch.assert_not_called()


def test_emit_citation_verify_progress_includes_counts_and_capped_ids():
    removed = [f"source:fake{i}" for i in range(CITATION_REMOVED_IDS_CAP + 5)]
    with patch(
        "construction_os.graphs.progress.dispatch_custom_event"
    ) as mock_dispatch:
        emit_citation_verify_progress(
            removed_ids=removed,
            kept_ids=["source:real", "note:ok"],
            config={"callbacks": []},
        )

    mock_dispatch.assert_called_once()
    args, kwargs = mock_dispatch.call_args
    assert args[0] == AGENT_PROGRESS_EVENT
    payload = args[1]
    assert payload["phase"] == "completed"
    assert payload["step"] == "verifying_citations"
    detail = payload["detail"]
    assert detail["citationViolations"] == len(removed)
    assert detail["keptCitationCount"] == 2
    assert detail["removedCitationIds"] == removed[:CITATION_REMOVED_IDS_CAP]
    assert kwargs.get("config") is not None


def test_generate_with_tools_emits_citation_verify_after_strip():
    """RAG-015: strip + progress detail when a fake citation is removed."""
    from construction_os.tool_runtime import chat_loop

    async def fake_provision(*_args, **_kwargs):
        model = MagicMock()
        model.bind_tools = MagicMock(return_value=model)
        model.invoke = MagicMock(
            return_value=AIMessage(
                content="See [source:real] and [source:fake]."
            )
        )
        return model

    payload = [
        SystemMessage(content="- id: source:real\n  parent: source:real"),
        HumanMessage(content="What about warranties?"),
    ]
    config = {"callbacks": []}

    with patch(
        "construction_os.tool_runtime.chat_loop.emit_citation_verify_progress"
    ) as mock_emit:
        ai = asyncio.run(
            chat_loop.generate_with_tools(
                provision_model=fake_provision,
                payload=payload,
                model_id=None,
                mcp_tool_ids=None,
                session_id="session:1",
                message_id="msg-1",
                config=config,
            )
        )

    assert "source:fake" not in ai.content
    assert "source:real" in ai.content
    mock_emit.assert_called_once()
    kwargs = mock_emit.call_args.kwargs
    assert kwargs["removed_ids"] == ["source:fake"]
    assert "source:real" in kwargs["kept_ids"]
    assert kwargs["config"] is config

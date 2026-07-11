"""Tests for MCP chat tool loop helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from construction_os.mcp.chat_loop import generate_with_mcp_tools


@pytest.mark.asyncio
async def test_generate_without_tools_returns_model_response():
    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="Hello there")
    provision = AsyncMock(return_value=mock_model)

    result = await generate_with_mcp_tools(
        provision_model=provision,
        payload=[HumanMessage(content="Hi")],
        model_id=None,
        mcp_tool_ids=[],
        session_id="chat_session:test",
        message_id="msg-1",
    )

    assert result.content == "Hello there"
    assert result.id == "msg-1"
    mock_model.bind_tools.assert_not_called()


@pytest.mark.asyncio
async def test_generate_rejects_unauthorized_tool_name():
    mock_model = MagicMock()
    mock_model.bind_tools.return_value = mock_model
    mock_model.invoke.side_effect = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "tc1",
                    "name": "mcp__conn__echo",
                    "args": {"text": "hi"},
                }
            ],
        ),
        AIMessage(content="Done"),
    ]
    provision = AsyncMock(return_value=mock_model)

    with patch(
        "construction_os.mcp.chat_loop.build_allowlist",
        new_callable=AsyncMock,
    ) as mock_allowlist, patch(
        "construction_os.mcp.chat_loop.build_langchain_tools",
        return_value=[],
    ), patch(
        "construction_os.mcp.chat_loop.reject_unauthorized",
        new_callable=AsyncMock,
    ) as mock_reject:
        mock_allowlist.return_value = MagicMock()
        mock_reject.return_value = MagicMock(id="audit-1", status="rejected")

        result = await generate_with_mcp_tools(
            provision_model=provision,
            payload=[HumanMessage(content="Use echo")],
            model_id=None,
            mcp_tool_ids=["tool:1"],
            session_id="chat_session:test",
            message_id="msg-2",
        )

    mock_reject.assert_awaited_once()
    assert result.content == ""
    assert result.id == "msg-2"

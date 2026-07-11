"""Shared model+MCP tool execution loop for chat graphs."""

from __future__ import annotations

from typing import Any, Callable, Optional

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from construction_os.mcp.allowlist import build_allowlist
from construction_os.mcp.execution import DuplicateCallGuard, reject_unauthorized
from construction_os.mcp.langgraph_tools import build_langchain_tools
from construction_os.mcp.limits import MAX_TOOL_CALLS, MAX_TOOL_ITERATIONS


async def generate_with_mcp_tools(
    *,
    provision_model: Callable[..., Any],
    payload: list[BaseMessage],
    model_id: Optional[str],
    mcp_tool_ids: Optional[list],
    session_id: str,
    message_id: Optional[str] = None,
    config: Optional[RunnableConfig] = None,
) -> AIMessage:
    """
    Invoke the chat model, optionally binding MCP tools and running a bounded loop.

    `provision_model` should be an async callable matching provision_langchain_model.
    """
    model = await provision_model(str(payload), model_id, "chat", max_tokens=8192)
    allowlist = await build_allowlist(mcp_tool_ids)
    guard = DuplicateCallGuard()
    tools = build_langchain_tools(
        allowlist,
        session_id=session_id,
        message_id=message_id,
        guard=guard,
        config=config,
    )
    if tools:
        model = model.bind_tools(tools)

    invoke_config = config or {}
    working: list[BaseMessage] = list(payload)
    call_count = 0
    ai_message: AIMessage | None = None

    for _ in range(MAX_TOOL_ITERATIONS if tools else 1):
        ai_message = model.invoke(working, config=invoke_config)
        tool_calls = getattr(ai_message, "tool_calls", None) or []
        if not tool_calls:
            break
        if not tools:
            for tc in tool_calls:
                await reject_unauthorized(
                    session_id=session_id,
                    runtime_name=tc.get("name") or "",
                    arguments=tc.get("args") or {},
                    message_id=message_id,
                    config=config,
                )
            break

        working.append(ai_message)
        for tc in tool_calls:
            if call_count >= MAX_TOOL_CALLS:
                working.append(
                    ToolMessage(
                        content="Tool call limit reached for this turn.",
                        tool_call_id=tc.get("id") or "limit",
                    )
                )
                continue
            call_count += 1
            name = tc.get("name") or ""
            args = tc.get("args") or {}
            matched = next((t for t in tools if t.name == name), None)
            if matched is None:
                await reject_unauthorized(
                    session_id=session_id,
                    runtime_name=name,
                    arguments=args,
                    message_id=message_id,
                    config=config,
                )
                working.append(
                    ToolMessage(
                        content=(
                            "Tool rejected: not in the authorized allowlist. "
                            "Do not retry the same unauthorized request."
                        ),
                        tool_call_id=tc.get("id") or name,
                    )
                )
                continue
            result_text = await matched.ainvoke(args, config=invoke_config)
            working.append(
                ToolMessage(
                    content=str(result_text),
                    tool_call_id=tc.get("id") or name,
                )
            )
    else:
        if tools and ai_message is not None and (
            getattr(ai_message, "tool_calls", None) or []
        ):
            plain = await provision_model(
                str(working), model_id, "chat", max_tokens=8192
            )
            ai_message = plain.invoke(working, config=invoke_config)

    assert ai_message is not None
    if message_id:
        ai_message = ai_message.model_copy(update={"id": message_id})
    return ai_message

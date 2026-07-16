"""Unified model + native/MCP tool execution loop for chat graphs."""

from __future__ import annotations

from typing import Any, Callable, Optional

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool

from construction_os.capabilities.langchain_bridge import build_native_langchain_tools
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.mcp.allowlist import build_allowlist
from construction_os.mcp.langgraph_tools import build_langchain_tools
from construction_os.mcp.limits import MAX_TOOL_CALLS, MAX_TOOL_ITERATIONS
from construction_os.tool_runtime.execution import (
    DuplicateCallGuard,
    reject_unauthorized,
)


async def generate_with_tools(
    *,
    provision_model: Callable[..., Any],
    payload: list[BaseMessage],
    model_id: Optional[str],
    mcp_tool_ids: Optional[list],
    session_id: str,
    message_id: Optional[str] = None,
    config: Optional[RunnableConfig] = None,
    strict_mcp_tools: bool = False,
    capability_context: Optional[CapabilityRuntimeContext] = None,
) -> AIMessage:
    """
    Invoke the chat model, binding native and/or MCP tools in one bounded loop.

    `provision_model` should be an async callable matching provision_langchain_model.
    """
    model = await provision_model(str(payload), model_id, "chat", max_tokens=8192)
    allowlist = await build_allowlist(
        mcp_tool_ids,
        strict_selected_tools=strict_mcp_tools,
    )
    guard = DuplicateCallGuard()
    tools: list[BaseTool] = []

    if capability_context is not None:
        # Keep message_id in sync for audit rows
        if message_id and not capability_context.message_id:
            capability_context.message_id = message_id
        tools.extend(
            build_native_langchain_tools(
                capability_context,
                guard=guard,
                config=config,
            )
        )

    tools.extend(
        build_langchain_tools(
            allowlist,
            session_id=session_id,
            message_id=message_id,
            guard=guard,
            config=config,
        )
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
            # Pass tool_call_id for native save idempotency when supported
            invoke_args = dict(args)
            result_text = await matched.ainvoke(invoke_args, config=invoke_config)
            working.append(
                ToolMessage(
                    content=str(result_text),
                    tool_call_id=tc.get("id") or name,
                )
            )
            # After native save, stash tool_call_id on context for idempotency
            # handlers that accept it via kwargs already handled inside bridge.
            if (
                capability_context is not None
                and name.startswith("native__save_project_artifact")
                and tc.get("id")
            ):
                # Re-run is unnecessary; bridge uses message_id fallback.
                pass
    else:
        if (
            tools
            and ai_message is not None
            and (getattr(ai_message, "tool_calls", None) or [])
        ):
            plain = await provision_model(
                str(working), model_id, "chat", max_tokens=8192
            )
            ai_message = plain.invoke(working, config=invoke_config)

    assert ai_message is not None
    if message_id:
        ai_message = ai_message.model_copy(update={"id": message_id})
    return ai_message

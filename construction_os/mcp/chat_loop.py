"""Compatibility wrapper — prefer construction_os.tool_runtime.chat_loop."""

from __future__ import annotations

from typing import Any, Callable, Optional

from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig

from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.tool_runtime.chat_loop import generate_with_tools


async def generate_with_mcp_tools(
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
    Compatibility entry point for existing callers.

    Delegates to the neutral unified loop in ``tool_runtime.chat_loop``.
    """
    return await generate_with_tools(
        provision_model=provision_model,
        payload=payload,
        model_id=model_id,
        mcp_tool_ids=mcp_tool_ids,
        session_id=session_id,
        message_id=message_id,
        config=config,
        strict_mcp_tools=strict_mcp_tools,
        capability_context=capability_context,
    )

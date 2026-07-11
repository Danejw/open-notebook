"""Emit AG-UI-compatible MCP tool-call progress events from LangGraph nodes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from langchain_core.callbacks.manager import dispatch_custom_event
from langchain_core.runnables import RunnableConfig

from construction_os.mcp.public import public_tool_call

if TYPE_CHECKING:
    from construction_os.domain.mcp import ChatToolCall

MCP_TOOL_CALL_EVENT = "mcp_tool_call"


def _audit_payload(audit: "ChatToolCall") -> dict:
    return public_tool_call(
        {
            "id": audit.id,
            "session_id": audit.session_id,
            "message_id": audit.message_id,
            "connection_id": audit.connection_id,
            "tool_id": audit.tool_id,
            "tool_name": audit.tool_name,
            "connection_name": audit.connection_name,
            "risk_level": audit.risk_level,
            "runtime_name": audit.runtime_name,
            "arguments": audit.arguments,
            "result_text": audit.result_text,
            "status": audit.status,
            "error": audit.error,
            "created": getattr(audit, "created", None),
            "updated": getattr(audit, "updated", None),
        }
    )


def emit_mcp_tool_call(audit: "ChatToolCall", config: Optional[RunnableConfig] = None) -> None:
    """Stream a tool-call audit snapshot to AG-UI clients (CUSTOM event)."""
    if not config:
        return
    dispatch_custom_event(
        MCP_TOOL_CALL_EVENT,
        _audit_payload(audit),
        config=config,
    )

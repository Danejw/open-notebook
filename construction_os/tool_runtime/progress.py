"""Emit AG-UI-compatible tool-call progress events from LangGraph nodes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from langchain_core.callbacks.manager import dispatch_custom_event
from langchain_core.runnables import RunnableConfig

from construction_os.mcp.public import public_tool_call

if TYPE_CHECKING:
    from construction_os.domain.mcp import ChatToolCall

# Keep legacy event name for frontend compatibility; payload is source-neutral.
MCP_TOOL_CALL_EVENT = "mcp_tool_call"
TOOL_CALL_EVENT = "tool_call"


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
            "tool_source": getattr(audit, "tool_source", None) or "mcp",
            "performed_write": bool(getattr(audit, "performed_write", False)),
            "error_category": getattr(audit, "error_category", None),
            "started_at": getattr(audit, "started_at", None),
            "completed_at": getattr(audit, "completed_at", None),
            "duration_ms": getattr(audit, "duration_ms", None),
            "created": getattr(audit, "created", None),
            "updated": getattr(audit, "updated", None),
        }
    )


def emit_tool_call(audit: "ChatToolCall", config: Optional[RunnableConfig] = None) -> None:
    """Stream a tool-call audit snapshot to AG-UI clients (CUSTOM event)."""
    if not config:
        return
    payload = _audit_payload(audit)
    dispatch_custom_event(MCP_TOOL_CALL_EVENT, payload, config=config)


# Back-compat alias used by MCP execution path
emit_mcp_tool_call = emit_tool_call

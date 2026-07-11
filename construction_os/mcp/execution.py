"""MCP tool execution helpers with audit + duplicate-call protection."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from loguru import logger

from langchain_core.runnables import RunnableConfig

from construction_os.domain.mcp import ChatToolCall
from construction_os.mcp.allowlist import AllowlistedTool, RuntimeAllowlist
from construction_os.mcp.progress import emit_mcp_tool_call
from construction_os.mcp.client import McpClient
from construction_os.mcp.result_text import bound_error_message, mcp_result_to_text
from construction_os.mcp.schema_validate import (
    McpArgumentValidationError,
    validate_tool_arguments,
)
from construction_os.mcp.transport import McpTransportError


class DuplicateCallGuard:
    """Prevent identical (runtime_name, args) calls within one chat turn."""

    def __init__(self) -> None:
        self._seen: set[str] = set()

    @staticmethod
    def _key(runtime_name: str, arguments: dict[str, Any]) -> str:
        payload = json.dumps(arguments, sort_keys=True, default=str)
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
        return f"{runtime_name}:{digest}"

    def check_and_record(self, runtime_name: str, arguments: dict[str, Any]) -> bool:
        """Return True if this is a duplicate (already seen)."""
        key = self._key(runtime_name, arguments)
        if key in self._seen:
            return True
        self._seen.add(key)
        return False


async def execute_allowlisted_tool(
    entry: AllowlistedTool,
    arguments: Any,
    *,
    session_id: str,
    message_id: Optional[str] = None,
    guard: Optional[DuplicateCallGuard] = None,
    allowlist: Optional[RuntimeAllowlist] = None,
    config: Optional[RunnableConfig] = None,
) -> ChatToolCall:
    """
    Validate, audit, and execute one allowlisted MCP tool call.

    Rejects non-executable / off-allowlist / invalid args without contacting MCP.
    """
    args = arguments if isinstance(arguments, dict) else {}
    audit = ChatToolCall(
        session_id=session_id,
        message_id=message_id,
        connection_id=str(entry.connection.id) if entry.connection.id else None,
        tool_id=str(entry.tool.id) if entry.tool.id else None,
        tool_name=entry.tool.name,
        connection_name=entry.connection.name,
        risk_level=entry.tool.risk_level,
        runtime_name=entry.runtime_name,
        arguments=args,
        status="requested",
    )
    await audit.save()
    emit_mcp_tool_call(audit, config)

    if not entry.executable or entry.tool.risk_level != "read":
        audit.status = "rejected"
        audit.error = "Tool is not executable (action/unknown tools require approval)"
        await audit.save()
        emit_mcp_tool_call(audit, config)
        return audit

    if guard and guard.check_and_record(entry.runtime_name, args):
        audit.status = "rejected"
        audit.error = "Duplicate tool call with identical arguments in this turn"
        await audit.save()
        emit_mcp_tool_call(audit, config)
        logger.info("MCP duplicate call rejected runtime={}", entry.runtime_name)
        return audit

    try:
        validate_tool_arguments(args, entry.tool.input_schema)
    except McpArgumentValidationError as exc:
        audit.status = "rejected"
        audit.error = bound_error_message(str(exc))
        await audit.save()
        emit_mcp_tool_call(audit, config)
        return audit

    audit.status = "running"
    await audit.save()
    emit_mcp_tool_call(audit, config)

    client = McpClient(
        entry.connection.endpoint_url,
        bearer_token=entry.connection.get_bearer_token(),
    )
    try:
        await client.connect()
        raw = await client.call_tool(entry.tool.name, args)
        audit.raw_result = raw if isinstance(raw, dict) else {"value": raw}
        audit.result_text = mcp_result_to_text(raw)
        if isinstance(raw, dict) and raw.get("isError"):
            audit.status = "failed"
            audit.error = bound_error_message(audit.result_text or "MCP tool error")
        else:
            audit.status = "succeeded"
            audit.error = None
        await audit.save()
        emit_mcp_tool_call(audit, config)
        logger.info(
            "MCP call status={} runtime={} duration_logged",
            audit.status,
            entry.runtime_name,
        )
        return audit
    except (McpTransportError, Exception) as exc:
        audit.status = "failed"
        audit.error = bound_error_message(str(exc))
        await audit.save()
        emit_mcp_tool_call(audit, config)
        logger.warning("MCP call failed runtime={}", entry.runtime_name)
        return audit


async def reject_unauthorized(
    *,
    session_id: str,
    runtime_name: str,
    arguments: Any,
    message_id: Optional[str] = None,
    reason: str = "Tool is not in the authorized allowlist",
    config: Optional[RunnableConfig] = None,
) -> ChatToolCall:
    """Record a rejected off-allowlist tool request without contacting MCP."""
    audit = ChatToolCall(
        session_id=session_id,
        message_id=message_id,
        tool_name=runtime_name,
        runtime_name=runtime_name,
        arguments=arguments if isinstance(arguments, dict) else {},
        status="rejected",
        error=bound_error_message(reason),
    )
    await audit.save()
    emit_mcp_tool_call(audit, config)
    logger.info("MCP unauthorized reject runtime={}", runtime_name)
    return audit

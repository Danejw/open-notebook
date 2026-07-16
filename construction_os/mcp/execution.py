"""MCP tool execution helpers with audit + duplicate-call protection."""

from __future__ import annotations

from typing import Any, Optional

from loguru import logger

from langchain_core.runnables import RunnableConfig

from construction_os.domain.mcp import ChatToolCall
from construction_os.mcp.allowlist import AllowlistedTool, RuntimeAllowlist
from construction_os.mcp.client import McpClient
from construction_os.mcp.result_text import bound_error_message, mcp_result_to_text
from construction_os.mcp.schema_validate import (
    McpArgumentValidationError,
    validate_tool_arguments,
)
from construction_os.mcp.transport import McpTransportError
from construction_os.tool_runtime.execution import (
    DuplicateCallGuard,
    begin_audit,
    finalize_timing,
    reject_unauthorized,
    save_and_emit,
)

__all__ = [
    "DuplicateCallGuard",
    "execute_allowlisted_tool",
    "reject_unauthorized",
]


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
    del allowlist  # reserved for future cross-checks
    args = arguments if isinstance(arguments, dict) else {}
    audit = begin_audit(
        session_id=session_id,
        tool_name=entry.tool.name,
        runtime_name=entry.runtime_name,
        tool_source="mcp",
        arguments=args,
        message_id=message_id,
        connection_id=str(entry.connection.id) if entry.connection.id else None,
        tool_id=str(entry.tool.id) if entry.tool.id else None,
        connection_name=entry.connection.name,
        risk_level=entry.tool.risk_level,
        performed_write=False,
    )
    await save_and_emit(audit, config)

    if not entry.executable or entry.tool.risk_level != "read":
        audit.status = "rejected"
        audit.error = "Tool is not executable (action/unknown tools require approval)"
        audit.error_category = "not_executable"
        finalize_timing(audit)
        await save_and_emit(audit, config)
        return audit

    if guard and guard.check_and_record(entry.runtime_name, args):
        audit.status = "rejected"
        audit.error = "Duplicate tool call with identical arguments in this turn"
        audit.error_category = "duplicate"
        finalize_timing(audit)
        await save_and_emit(audit, config)
        logger.info("MCP duplicate call rejected runtime={}", entry.runtime_name)
        return audit

    try:
        validate_tool_arguments(args, entry.tool.input_schema)
    except McpArgumentValidationError as exc:
        audit.status = "rejected"
        audit.error = bound_error_message(str(exc))
        audit.error_category = "validation"
        finalize_timing(audit)
        await save_and_emit(audit, config)
        return audit

    audit.status = "running"
    await save_and_emit(audit, config)

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
            audit.error_category = "mcp_error"
        else:
            audit.status = "succeeded"
            audit.error = None
        finalize_timing(audit)
        await save_and_emit(audit, config)
        logger.info(
            "MCP call status={} runtime={}",
            audit.status,
            entry.runtime_name,
        )
        return audit
    except (McpTransportError, Exception) as exc:
        audit.status = "failed"
        audit.error = bound_error_message(str(exc))
        audit.error_category = "transport"
        finalize_timing(audit)
        await save_and_emit(audit, config)
        logger.warning("MCP call failed runtime={}", entry.runtime_name)
        return audit

"""Build LangChain StructuredTools from an MCP runtime allowlist."""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model

from construction_os.mcp.allowlist import AllowlistedTool, RuntimeAllowlist
from construction_os.mcp.execution import DuplicateCallGuard, execute_allowlisted_tool


def build_langchain_tools(
    allowlist: RuntimeAllowlist,
    *,
    session_id: str,
    message_id: Optional[str] = None,
    guard: Optional[DuplicateCallGuard] = None,
    config: Optional[RunnableConfig] = None,
) -> list[StructuredTool]:
    """Create LangChain tools for executable allowlist entries only."""
    tools: list[StructuredTool] = []
    call_guard = guard or DuplicateCallGuard()

    for entry in allowlist.executable_entries():
        tools.append(
            _make_tool(
                entry,
                session_id=session_id,
                message_id=message_id,
                guard=call_guard,
                config=config,
            )
        )
    return tools


def _make_tool(
    entry: AllowlistedTool,
    *,
    session_id: str,
    message_id: Optional[str],
    guard: DuplicateCallGuard,
    config: Optional[RunnableConfig],
) -> StructuredTool:
    args_schema = _schema_to_pydantic(entry.tool.input_schema, entry.runtime_name)

    async def _arun(**kwargs: Any) -> str:
        audit = await execute_allowlisted_tool(
            entry,
            kwargs,
            session_id=session_id,
            message_id=message_id,
            guard=guard,
            config=config,
        )
        if audit.status == "succeeded":
            return audit.result_text or ""
        if audit.status == "rejected":
            return (
                f"Tool rejected: {audit.error}. "
                "Do not retry the same unauthorized or invalid request."
            )
        return f"Tool failed: {audit.error or 'unknown error'}"

    def _run(**kwargs: Any) -> str:
        return asyncio.get_event_loop().run_until_complete(_arun(**kwargs))

    return StructuredTool.from_function(
        coroutine=_arun,
        func=_run,
        name=entry.runtime_name,
        description=_tool_description(entry),
        args_schema=args_schema,
    )


def _tool_description(entry: AllowlistedTool) -> str:
    parts = [
        entry.tool.title or entry.tool.name,
        entry.tool.description or "",
        f"(connection: {entry.connection.name}, risk: {entry.tool.risk_level})",
    ]
    return " — ".join(p for p in parts if p)


def _schema_to_pydantic(
    input_schema: Optional[dict[str, Any]], model_name: str
) -> type[BaseModel]:
    """Build a loose Pydantic model from JSON Schema properties."""
    props = (input_schema or {}).get("properties") or {}
    required = set((input_schema or {}).get("required") or [])
    fields: dict[str, Any] = {}
    for key, prop in props.items():
        if not isinstance(prop, dict):
            continue
        py_type: Any = Any
        t = prop.get("type")
        if t == "string":
            py_type = str
        elif t == "integer":
            py_type = int
        elif t == "number":
            py_type = float
        elif t == "boolean":
            py_type = bool
        elif t == "array":
            py_type = list
        elif t == "object":
            py_type = dict
        default = ... if key in required else None
        fields[key] = (Optional[py_type] if default is None else py_type, Field(default=default))
    if not fields:
        fields["payload"] = (Optional[dict], Field(default=None))
    safe_name = "".join(c if c.isalnum() else "_" for c in model_name)[:50] or "McpArgs"
    return create_model(safe_name, **fields)  # type: ignore[call-overload]

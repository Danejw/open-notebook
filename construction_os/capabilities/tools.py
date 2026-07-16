"""list_tools / get_tool — external/MCP discovery only (not native tools)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from construction_os.capabilities.authz import require_project_session
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.domain.mcp import McpConnection, McpTool
from construction_os.exceptions import NotFoundError
from construction_os.mcp.public import public_tool


class ListToolsInput(BaseModel):
    query: Optional[str] = None
    selected_only: bool = False


class ListToolsOutput(BaseModel):
    tools: list[dict[str, Any]] = Field(default_factory=list)
    note: str = (
        "Lists external/MCP tools only. Native Construction OS tools are "
        "automatically available and are not included. Discovery does not "
        "authorize execution — an external tool is executable only when "
        "selected and allowlisted."
    )


class GetToolInput(BaseModel):
    tool_id: str


class GetToolOutput(BaseModel):
    tool: dict[str, Any]
    note: str = (
        "Discovery metadata only. This tool does not execute MCP tools. "
        "Execution requires manual selection and the existing MCP allowlist path."
    )


async def list_tools(
    ctx: CapabilityRuntimeContext,
    inputs: ListToolsInput | None = None,
) -> ListToolsOutput:
    await require_project_session(ctx)
    filters = inputs or ListToolsInput()
    selected = set(ctx.explicit_mcp_tool_ids)
    rows = await McpTool.list_selectable()
    tools: list[dict[str, Any]] = []
    for row in rows:
        tool_id = str(row.get("id") or "")
        if filters.selected_only and tool_id not in selected:
            continue
        pub = public_tool(
            row,
            connection_name=row.get("connection_name"),
        )
        pub["selected"] = tool_id in selected
        pub["can_execute_in_chat"] = bool(
            pub.get("executable") and tool_id in selected
        )
        if filters.query:
            q = filters.query.lower()
            hay = " ".join(
                [
                    str(pub.get("name") or ""),
                    str(pub.get("title") or ""),
                    str(pub.get("description") or ""),
                    str(pub.get("connection_name") or ""),
                ]
            ).lower()
            if q not in hay:
                continue
        # Never expose connection secrets — public_tool already strips them
        tools.append(pub)
    return ListToolsOutput(tools=tools)


async def get_tool(
    ctx: CapabilityRuntimeContext,
    inputs: GetToolInput,
) -> GetToolOutput:
    await require_project_session(ctx)
    tool = await McpTool.get(inputs.tool_id)
    if not tool:
        raise NotFoundError(f"Tool not found: {inputs.tool_id}")
    connection_name: Optional[str] = None
    conn_id = str(tool.connection) if tool.connection else None
    if conn_id:
        try:
            conn = await McpConnection.get(conn_id)
            connection_name = conn.name if conn else None
        except Exception:
            connection_name = None
    pub = public_tool(
        {
            "id": tool.id,
            "connection": tool.connection,
            "name": tool.name,
            "title": tool.title,
            "description": tool.description,
            "input_schema": tool.input_schema,
            "output_schema": tool.output_schema,
            "annotations": tool.annotations,
            "risk_level": tool.risk_level,
            "available": tool.available,
            "last_discovered_at": getattr(tool, "last_discovered_at", None),
            "created": tool.created,
            "updated": tool.updated,
        },
        connection_name=connection_name,
    )
    selected = str(tool.id) in set(ctx.explicit_mcp_tool_ids)
    pub["selected"] = selected
    pub["can_execute_in_chat"] = bool(pub.get("executable") and selected)
    pub["when_to_use"] = tool.description
    return GetToolOutput(tool=pub)

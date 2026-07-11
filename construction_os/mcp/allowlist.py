"""Runtime allowlist construction for selected MCP tools."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from open_notebook.domain.mcp import McpConnection, McpTool
from open_notebook.mcp.limits import MAX_SELECTED_TOOLS


@dataclass
class AllowlistedTool:
    """Authorized tool entry for one chat turn."""

    tool: McpTool
    connection: McpConnection
    runtime_name: str
    executable: bool


@dataclass
class RuntimeAllowlist:
    """Server-built allowlist — sole authorization source for tool calls."""

    tools: list[AllowlistedTool] = field(default_factory=list)

    def by_runtime_name(self, name: str) -> Optional[AllowlistedTool]:
        for entry in self.tools:
            if entry.runtime_name == name:
                return entry
        return None

    def executable_entries(self) -> list[AllowlistedTool]:
        return [t for t in self.tools if t.executable]


def make_runtime_name(connection_id: str, tool_name: str) -> str:
    """
    Build a unique runtime tool name including connection identity.

    Format: mcp__<conn_short>__<sanitized_tool_name>
    """
    short = (connection_id or "").split(":")[-1][:12]
    short = re.sub(r"[^a-zA-Z0-9]", "", short) or "conn"
    safe_tool = re.sub(r"[^a-zA-Z0-9_]", "_", tool_name)
    return f"mcp__{short}__{safe_tool}"


async def build_allowlist(tool_ids: list[str] | None) -> RuntimeAllowlist:
    """
    Reload selected tool ids, drop missing/unavailable, mark non-read as
    non-executable. Browser ids are a request only.
    """
    if not tool_ids:
        return RuntimeAllowlist()

    unique_ids = list(dict.fromkeys(tool_ids))[:MAX_SELECTED_TOOLS]
    entries: list[AllowlistedTool] = []

    for tool_id in unique_ids:
        try:
            tool = await McpTool.get(tool_id)
        except Exception:
            continue
        if not tool.available:
            continue
        try:
            connection = await McpConnection.get(str(tool.connection))
        except Exception:
            continue

        runtime_name = make_runtime_name(str(connection.id), tool.name)
        executable = tool.risk_level == "read"
        entries.append(
            AllowlistedTool(
                tool=tool,
                connection=connection,
                runtime_name=runtime_name,
                executable=executable,
            )
        )

    return RuntimeAllowlist(tools=entries)


def allowlist_model_descriptions(allowlist: RuntimeAllowlist) -> list[dict[str, Any]]:
    """Compact tool descriptions for the model (executable tools only)."""
    out: list[dict[str, Any]] = []
    for entry in allowlist.executable_entries():
        out.append(
            {
                "tool_id": entry.runtime_name,
                "name": entry.tool.name,
                "title": entry.tool.title,
                "description": entry.tool.description,
                "input_schema": entry.tool.input_schema or {"type": "object"},
                "connection_name": entry.connection.name,
                "risk_level": entry.tool.risk_level,
            }
        )
    return out

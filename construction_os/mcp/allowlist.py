"""Runtime allowlist construction for selected MCP tools."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from construction_os.domain.mcp import McpConnection, McpTool
from construction_os.mcp.limits import MAX_SELECTED_TOOLS


class McpToolSelectionError(ValueError):
    """Raised when a strict selected-tool allowlist cannot be built exactly."""


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


async def build_allowlist(
    tool_ids: list[str] | None,
    *,
    strict_selected_tools: bool = False,
) -> RuntimeAllowlist:
    """
    Reload selected tool IDs and construct the executable runtime allowlist.

    Strict queue execution rejects every missing, unavailable, disconnected, or
    non-read selection instead of silently omitting it.
    """
    if not tool_ids:
        return RuntimeAllowlist()

    unique_ids = list(dict.fromkeys(tool_ids))
    if len(unique_ids) > MAX_SELECTED_TOOLS:
        if strict_selected_tools:
            raise McpToolSelectionError(
                f"Selected tools exceed the limit of {MAX_SELECTED_TOOLS}"
            )
        unique_ids = unique_ids[:MAX_SELECTED_TOOLS]
    entries: list[AllowlistedTool] = []

    for tool_id in unique_ids:
        try:
            tool = await McpTool.get(tool_id)
        except Exception as exc:
            if strict_selected_tools:
                raise McpToolSelectionError(
                    f"Selected tool '{tool_id}' no longer exists"
                ) from exc
            continue
        if not tool.available:
            if strict_selected_tools:
                raise McpToolSelectionError(f"Selected tool '{tool_id}' is unavailable")
            continue
        try:
            connection = await McpConnection.get(str(tool.connection))
        except Exception as exc:
            if strict_selected_tools:
                raise McpToolSelectionError(
                    f"Connection for selected tool '{tool_id}' no longer exists"
                ) from exc
            continue
        if connection.status != "connected":
            if strict_selected_tools:
                raise McpToolSelectionError(
                    f"Connection for selected tool '{tool_id}' is unavailable"
                )
            continue

        runtime_name = make_runtime_name(str(connection.id), tool.name)
        executable = tool.risk_level == "read"
        if strict_selected_tools and not executable:
            raise McpToolSelectionError(f"Selected tool '{tool_id}' is not read-only")
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

"""MCP client package — server-only Model Context Protocol helpers."""

from construction_os.mcp.limits import (
    MAX_RESULT_CHARS,
    MAX_SELECTED_TOOLS,
    MAX_TOOL_CALLS,
    MAX_TOOL_ITERATIONS,
    MCP_REQUEST_TIMEOUT_SECONDS,
)
from construction_os.mcp.risk import classify_tool_risk
from construction_os.mcp.url_safety import McpUrlError, validate_mcp_url

__all__ = [
    "MAX_RESULT_CHARS",
    "MAX_SELECTED_TOOLS",
    "MAX_TOOL_CALLS",
    "MAX_TOOL_ITERATIONS",
    "MCP_REQUEST_TIMEOUT_SECONDS",
    "McpUrlError",
    "classify_tool_risk",
    "validate_mcp_url",
]

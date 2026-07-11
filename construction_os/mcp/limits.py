"""Central limits for MCP client behavior."""

from __future__ import annotations

from construction_os.utils.env import get_env

# Selection / loop bounds
MAX_SELECTED_TOOLS = int(get_env("CONSTRUCTION_OS_MCP_MAX_SELECTED_TOOLS", "8") or "8")
MAX_TOOL_ITERATIONS = int(get_env("CONSTRUCTION_OS_MCP_MAX_ITERATIONS", "6") or "6")
MAX_TOOL_CALLS = int(get_env("CONSTRUCTION_OS_MCP_MAX_CALLS", "12") or "12")

# Network / payload bounds
MCP_REQUEST_TIMEOUT_SECONDS = float(
    get_env("CONSTRUCTION_OS_MCP_REQUEST_TIMEOUT_SECONDS", "30") or "30"
)
MAX_RESULT_CHARS = int(get_env("CONSTRUCTION_OS_MCP_MAX_RESULT_CHARS", "8000") or "8000")
MAX_ERROR_CHARS = int(get_env("CONSTRUCTION_OS_MCP_MAX_ERROR_CHARS", "500") or "500")
MAX_LOG_DETAIL_CHARS = 200

# Protocol
MCP_PROTOCOL_VERSION = get_env("CONSTRUCTION_OS_MCP_PROTOCOL_VERSION", "2025-03-26") or "2025-03-26"
DEFAULT_TRANSPORT = "streamable_http"

# Env flag for private/loopback URLs
ALLOW_PRIVATE_URLS_ENV = "CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS"

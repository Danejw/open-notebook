"""Central limits for MCP client behavior."""

from __future__ import annotations

import os

# Selection / loop bounds
MAX_SELECTED_TOOLS = int(os.environ.get("OPEN_NOTEBOOK_MCP_MAX_SELECTED_TOOLS", "8"))
MAX_TOOL_ITERATIONS = int(os.environ.get("OPEN_NOTEBOOK_MCP_MAX_ITERATIONS", "6"))
MAX_TOOL_CALLS = int(os.environ.get("OPEN_NOTEBOOK_MCP_MAX_CALLS", "12"))

# Network / payload bounds
MCP_REQUEST_TIMEOUT_SECONDS = float(
    os.environ.get("OPEN_NOTEBOOK_MCP_REQUEST_TIMEOUT_SECONDS", "30")
)
MAX_RESULT_CHARS = int(os.environ.get("OPEN_NOTEBOOK_MCP_MAX_RESULT_CHARS", "8000"))
MAX_ERROR_CHARS = int(os.environ.get("OPEN_NOTEBOOK_MCP_MAX_ERROR_CHARS", "500"))
MAX_LOG_DETAIL_CHARS = 200

# Protocol
MCP_PROTOCOL_VERSION = os.environ.get(
    "OPEN_NOTEBOOK_MCP_PROTOCOL_VERSION", "2025-03-26"
)
DEFAULT_TRANSPORT = "streamable_http"

# Env flag for private/loopback URLs
ALLOW_PRIVATE_URLS_ENV = "OPEN_NOTEBOOK_MCP_ALLOW_PRIVATE_URLS"

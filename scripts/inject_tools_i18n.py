"""Inject tools i18n block into non-en-US locale files."""

from __future__ import annotations

import re
from pathlib import Path

TOOLS_BLOCK = """  tools: {
    title: "MCP Tools",
    desc: "Connect external MCP servers and use their read-only tools in chat.",
    listTitle: "Your Connections",
    empty: "No MCP connections yet",
    emptyDesc: "Add an MCP server endpoint to discover and use tools in chat.",
    addConnection: "Add Connection",
    addConnectionDesc: "Register a remote MCP server using streamable HTTP transport.",
    createSuccess: "MCP connection created",
    deleteSuccess: "MCP connection removed",
    authUpdateSuccess: "Authentication updated",
    testSuccess: "Connection test succeeded",
    testFailed: "Connection test did not succeed",
    syncSuccess: "Tools synced from server",
    delete: "Remove Connection",
    deleteConfirm: "Remove \\"{name}\\"? Discovered tools for this connection will also be deleted.",
    test: "Test",
    sync: "Sync",
    open: "Open",
    toolCount: "{count} tools",
    lastSynced: "Last synced",
    lastConnected: "Last connected",
    lastError: "Last error",
    notFound: "Connection not found",
    backToList: "Back to tools",
    serverInfo: "Server info",
    capabilities: "Capabilities",
    metadata: "Connection details",
    authType: "Auth type",
    authConfigured: "Auth configured",
    authNone: "None",
    authBearer: "Bearer token",
    bearerToken: "Bearer token",
    bearerTokenPlaceholder: "Enter token (never shown again)",
    newBearerToken: "New bearer token",
    tokenNotShown: "Existing tokens are never displayed. Enter a new token to replace the current one.",
    replaceAuth: "Replace auth",
    replaceAuthDesc: "Update authentication for this MCP connection.",
    discoveredTools: "Discovered tools",
    noTools: "No tools discovered yet. Try syncing the connection.",
    riskLabel: "Risk",
    available: "Available",
    unavailable: "Unavailable",
    inputSchema: "Input schema",
    outputSchema: "Output schema",
    showSchema: "Show schema",
    hideSchema: "Hide schema",
    namePlaceholder: "My MCP Server",
    endpointUrl: "Endpoint URL",
    unknownConnection: "Unknown connection",
    pickerLabel: "MCP Tools",
    pickerTitle: "Select MCP Tools",
    pickerDesc: "Choose read-only tools to allow for the next chat message.",
    pickerEmpty: "No selectable tools. Add a connection under Manage → Tools and sync it.",
    pickerSelected: "{count} tools selected",
    pickerReadOnlyNote: "Only read-only tools can be selected in chat.",
    pickerUnavailableNote: "This tool is not currently available.",
    toolCallArgs: "Arguments",
    toolCallResult: "Result",
    toolCallError: "Error",
    risk: {
      read: "Read",
      action: "Action",
      unknown: "Unknown",
    },
    status: {
      connected: "Connected",
      error: "Error",
      unknown: "Unknown",
    },
    toolCallStatus: {
      succeeded: "Succeeded",
      running: "Running",
      requested: "Requested",
      failed: "Failed",
      rejected: "Rejected",
    },
  },
"""


def main() -> None:
    locales_dir = Path("frontend/src/lib/locales")
    for path in sorted(locales_dir.glob("*/index.ts")):
        if path.parent.name == "en-US":
            continue
        text = path.read_text(encoding="utf-8")
        changed = False
        if not re.search(r"^\s+tools:\s*\{", text, re.M):
            if re.search(r"^\s+models:\s*\{", text, re.M):
                text = re.sub(
                    r"^(\s+models:\s*\{)",
                    TOOLS_BLOCK + r"\1",
                    text,
                    count=1,
                    flags=re.M,
                )
                changed = True
        if not re.search(r"^\s+tools:\s*[\"']", text, re.M):
            if "transformations:" in text and "navigation:" in text:
                text = re.sub(
                    r"(transformations:\s*\"[^\"]+\",\n)",
                    r'\1    tools: "Tools",\n',
                    text,
                    count=1,
                )
                changed = True
        if changed:
            path.write_text(text, encoding="utf-8")
            print(f"updated {path}")


if __name__ == "__main__":
    main()

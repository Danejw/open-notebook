# AI protocols

Study and extension notes for agent/UI/tool protocols used inside Construction OS.

| Protocol | Role in Cos | Start here |
|----------|-------------|------------|
| **[A2UI](a2ui/extending.md)** | Declarative chat surfaces (Cos catalog over AG-UI `CUSTOM`) | [extending.md](a2ui/extending.md) · [components](a2ui/components.md) · [agent catalog](a2ui/agent-catalog.md) |
| **[AG-UI](agui/extending.md)** | Agent ↔ frontend SSE stream (LangGraph bridge) | [extending.md](agui/extending.md) · [events](agui/events.md) · [CUSTOM events](agui/custom-events.md) |
| **[MCP client](mcp/client/extending.md)** | Cos connects to remote MCP servers for allowlisted chat tools | [extending.md](mcp/client/extending.md) · [architecture](mcp/client/architecture.md) · [authorization](mcp/client/authorization.md) |

**Related (different role):** Cos as an MCP *server* for Claude Desktop / VS Code — [5-CONFIGURATION/mcp-integration.md](../5-CONFIGURATION/mcp-integration.md).

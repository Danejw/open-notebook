# MCP client architecture (Construction OS)

How Construction OS acts as an **MCP client**: connects to remote MCP servers, discovers tools, and runs allowlisted read tools inside chat.

**Protocol:** [Model Context Protocol](https://modelcontextprotocol.io)  
**Transport (v1):** Streamable HTTP (JSON-RPC over HTTP; JSON or SSE bodies)  
**Client info:** `construction-os` / `1.0.0`  
**Related:** [authorization.md](./authorization.md) · [extending.md](./extending.md)

This is **not** the Construction OS MCP *server* that Claude Desktop / VS Code use to call into Cos. That product surface lives in [docs/5-CONFIGURATION/mcp-integration.md](../../../5-CONFIGURATION/mcp-integration.md).

---

## Mental model

```
Admin UI / API
  → McpConnection (+ encrypted bearer) + sync → McpTool catalog

Chat turn (selected mcp_tool_ids)
  → build_allowlist (server-side authorization)
  → bind LangChain StructuredTools (read-only only)
  → generate_with_tools (bounded tool loop)
  → execute_allowlisted_tool → McpClient → remote tools/call
  → ChatToolCall audit + AG-UI CUSTOM "mcp_tool_call"
  → ToolMessage text back to the model
```

The model never talks to MCP directly. It only sees **runtime tool names** from the server-built allowlist. Off-allowlist or non-`read` tools are rejected and audited without contacting the remote server.

---

## Layers

| Layer | Responsibility | Canonical module |
|-------|----------------|------------------|
| Domain | `McpConnection`, `McpTool`, `ChatToolCall` | `construction_os/domain/mcp.py` |
| Transport | Streamable HTTP JSON-RPC | `construction_os/mcp/transport.py` |
| Client facade | `connect` / `list_tools` / `call_tool` | `construction_os/mcp/client.py` |
| Discovery | Test + sync catalog | `construction_os/mcp/discovery.py` |
| Risk | Classify `read` / `action` / `unknown` | `construction_os/mcp/risk.py` |
| Allowlist | Selected IDs → executable runtime entries | `construction_os/mcp/allowlist.py` |
| Execution | Validate, audit, call, bound result text | `construction_os/mcp/execution.py` |
| Chat loop | Model ↔ tools iterations | `tool_runtime/chat_loop.py` |
| LangChain bridge | `StructuredTool` wrappers | `construction_os/mcp/langgraph_tools.py` |
| Progress | AG-UI `mcp_tool_call` CUSTOM | `construction_os/mcp/progress.py` |
| Public DTOs | No secrets in API/SSE | `construction_os/mcp/public.py` |
| API | Connections / tools / session audits | `api/mcp_service.py`, `api/routers/mcp.py` |
| UI | Tools admin + chat picker + tool-call cards | `frontend/.../tools`, `components/mcp/*` |

---

## Domain records

| Table / model | Purpose |
|---------------|---------|
| **mcp_connection** | Named remote endpoint, transport, auth, status, server_info |
| **mcp_tool** | Discovered tool descriptor + `risk_level` + `available` |
| **chat_tool_call** | Per-attempt audit (requested → running → succeeded/failed/rejected) |

Bearer tokens live in encrypted `auth_config` (requires `CONSTRUCTION_OS_ENCRYPTION_KEY`). Public APIs expose `has_auth_config`, never the token.

---

## Connection lifecycle

1. **Create** — validate URL (`validate_mcp_url`), optional bearer, persist connection (`status: unknown`).
2. **Test** — `initialize` + `notifications/initialized`; set `connected` or `error`.
3. **Sync** — `tools/list`; upsert tools by `(connection, name)`; mark missing tools `available=false` (do not delete).
4. **Select in chat** — UI picks tool IDs (`GET /mcp/tools/selectable`); send as `mcp_tool_ids` on the turn.
5. **Execute** — allowlist + chat loop (see [authorization.md](./authorization.md)).

Admin routes (prefix `/mcp`):

| Method | Path | Action |
|--------|------|--------|
| GET/POST | `/mcp/connections` | List / create |
| GET/DELETE | `/mcp/connections/{id}` | Get / delete |
| PUT | `/mcp/connections/{id}/auth` | Update auth |
| POST | `/mcp/connections/{id}/test` | Connectivity |
| POST | `/mcp/connections/{id}/sync` | Discover tools |
| GET | `/mcp/connections/{id}/tools` | Tools for connection |
| GET | `/mcp/tools/selectable` | Chat picker catalog |
| GET | `/mcp/sessions/{session_id}/tool-calls` | Audit history |

---

## Chat integration

| Surface | How tools attach |
|---------|------------------|
| Project chat | `forwarded_props.mcp_tool_ids` → graph → `generate_with_tools` |
| Source chat | Same pattern (when present) |
| Chat queue | Same props; `strict_mcp_tools=True` so missing/non-read selections fail loudly |
| Artifact templates | Optional default `mcp_tool_ids` on template |

Frontend selection (`selectedMcpToolIds`) is **turn-scoped** (not persisted on `ChatSession` like skills/collections). Live progress uses AG-UI CUSTOM `mcp_tool_call` ([docs/ai-protocols/agui/custom-events.md](../../agui/custom-events.md)).

---

## Transport capabilities (v1)

`McpStreamableHttpTransport` supports:

- `initialize` / `notifications/initialized`
- `tools/list`
- `tools/call`

Response bodies: single JSON object, JSON array, or SSE `data:` frames. No redirect following. Auth header never logged.

Runtime tool name format:

```text
mcp__<conn_short>__<sanitized_tool_name>
```

Built by `make_runtime_name` so two connections with the same remote tool name do not collide in the model’s tool list.

---

## Adding behavior

Do not rebuild transport, allowlist, or the chat loop for a one-off tool. Follow [extending.md](./extending.md). Hard security rules stay in [authorization.md](./authorization.md).

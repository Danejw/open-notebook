# Extending the MCP client in Construction OS

How the in-app MCP client works today, and how to extend it **without rebuilding** transport, allowlist, or the chat loop.

**Role:** Construction OS → remote MCP servers (client)  
**Not:** Cos MCP server for Claude/VS Code — see [mcp-integration.md](../../../5-CONFIGURATION/mcp-integration.md)

Related: [architecture.md](./architecture.md) · [authorization.md](./authorization.md) · [AG-UI mcp_tool_call](../../agui/custom-events.md) · [Native tools](../../tools/extending.md)

---

## Mental model

MCP is a **tool protocol**. Cos owns connection admin, risk classification, allowlisting, audited execution, and streaming progress. The chat model only receives tools the server already authorized for that turn.

```
Remote MCP server (Streamable HTTP)
  ↔ McpClient / McpStreamableHttpTransport
  ↔ discovery (test/sync) OR execution (tools/call)
  ↔ domain records + ChatToolCall audit
  ↔ chat_loop / LangChain tools
  ↔ AG-UI CUSTOM mcp_tool_call → ToolCallCard UI
```

**Anti-patterns to reject:**

- Calling MCP from the frontend or from a one-off router bypassing allowlist
- Binding `action` tools “just for this experiment” without an approval path
- A second chat tool loop beside `tool_runtime.chat_loop.generate_with_tools`
- Logging bearer tokens or putting them in public API responses
- Per-tool special-case parsers in the UI (use shared `mcp_tool_call` + `ChatToolCall`)

---

## What you already get (do not rebuild)

| Concern | Owner | Extend by… |
|---------|-------|------------|
| Streamable HTTP | `transport.py` | New methods on the same transport, or a new transport class behind `McpClient` |
| Session facade | `client.py` | Thin methods delegating to transport |
| Catalog sync | `discovery.py` | Field mapping + risk classify on upsert |
| Risk | `risk.py` | Annotations / hints (keep conservative) |
| Allowlist | `allowlist.py` | Selection rules; keep server-side |
| Execute + audit | `execution.py` | Gates stay shared; don’t fork per tool |
| Model loop | `chat_loop.py` | Limits via `limits.py` |
| Progress SSE | `progress.py` + `lib/ag-ui/mcp-tool-calls.ts` | Same CUSTOM name |
| Admin API | `mcp_service` / `routers/mcp` | New endpoints only when admin UX needs them |
| Chat picker / cards | `components/mcp/*` | Reuse `ToolPicker`, `ToolCallCard`, risk badge |

---

## Checklist: support a new remote tool (usual case)

No Cos code required if the server exposes a normal MCP tool:

1. Admin → create connection (valid URL; bearer if needed; encryption key set).
2. **Test** then **Sync**.
3. Confirm `risk_level` is `read` (or fix remote annotations / name so classifier agrees).
4. In chat, select the tool → send message with `mcp_tool_ids`.
5. Watch `ToolCallCard` / session tool-calls; if rejected, read audit `error`.

If a useful tool classifies as `action`/`unknown`, either improve remote `readOnlyHint` or extend risk (security review) — do not bypass `executable` in the allowlist.

---

## Checklist: change risk classification

1. Edit `classify_tool_risk` in `construction_os/mcp/risk.py`.
2. Add/adjust `tests/test_mcp_*.py` (risk cases).
3. Update [authorization.md](./authorization.md).
4. Re-**sync** connections so stored `risk_level` refreshes.
5. Remember: only `read` becomes executable until an approval product exists.

---

## Checklist: add a transport (e.g. stdio)

Only if product requires it. Prefer Streamable HTTP.

1. Implement a transport with the same surface as `McpStreamableHttpTransport`: `initialize`, `list_tools`, `call_tool` (+ session/server_info as needed).
2. Teach `McpClient` (or a factory) to pick transport from `McpConnection.transport`.
3. Keep URL/auth validation appropriate to that transport; do not weaken SSRF rules for HTTP.
4. Extend create-connection API/UI enum; default remains `streamable_http`.
5. Tests: transport parse + discovery/execution against a fake server.
6. Update [architecture.md](./architecture.md) transport section.

---

## Checklist: change execution policy (limits, strictness, approval)

1. Limits → `construction_os/mcp/limits.py` (+ env docs if user-facing).
2. Allowlist / strict behavior → `allowlist.py` + queue `strict_mcp_tools` call sites.
3. New approval for `action` tools → **design first**: UI confirmation, audit status, and only then bind non-read tools. Do not half-enable in `execution.py` alone.
4. Update [authorization.md](./authorization.md) hard rules.
5. Cover live chat + queue paths in tests (`test_mcp_chat_loop.py`, queue worker tests).

---

## Checklist: expose a new admin/API field

1. Domain model (`construction_os/domain/mcp.py`) + migration if schema changes.
2. `public_connection` / `public_tool` / `public_tool_call` — never leak secrets.
3. `api/mcp_models.py` + `mcp_service` + router.
4. Frontend types/hooks (`lib/api/mcp`, `lib/hooks/use-mcp`) and Tools UI.
5. Keep DRY: one public mapper, thin API adapters.

---

## File map (canonical)

```
construction_os/domain/mcp.py          # McpConnection, McpTool, ChatToolCall
construction_os/mcp/
  client.py                            # McpClient facade
  transport.py                         # Streamable HTTP + SSE/JSON parse
  discovery.py                         # test_connection, sync_tools
  risk.py                              # classify_tool_risk
  allowlist.py                         # build_allowlist, runtime names
  execution.py                         # execute_allowlisted_tool, DuplicateCallGuard
  langgraph_tools.py                   # StructuredTool binding
  schema_validate.py                   # argument JSON Schema subset
  result_text.py                       # bounded model-facing text
  progress.py                          # emit mcp_tool_call CUSTOM
  public.py                            # safe API/SSE dicts
  url_safety.py                        # SSRF / URL normalize
  limits.py                            # caps + protocol version

construction_os/tool_runtime/
  chat_loop.py                         # generate_with_tools (native + MCP)

api/mcp_service.py
api/mcp_models.py
api/routers/mcp.py

frontend/src/lib/api/mcp.ts            # (or equivalent) HTTP client
frontend/src/lib/hooks/use-mcp.ts
frontend/src/lib/ag-ui/mcp-tool-calls.ts
frontend/src/components/mcp/           # ToolPicker, ToolCallCard, auth, risk badge
frontend/src/app/(dashboard)/tools/    # connection admin pages
```

Chat graphs call `generate_with_tools` from project chat nodes; queue runner forwards `mcp_tool_ids` with strict selection.

---

## Debugging (short)

| Symptom | Likely cause |
|---------|----------------|
| Tool missing from picker | Not synced / `available=false` / connection error |
| Tool in picker but model can’t call it | `risk_level` not `read` (not executable) |
| `rejected` + “not executable” | action/unknown selected or allowlist `executable=false` |
| `rejected` + duplicate | Same runtime name + args twice in one turn |
| `rejected` + schema | Args missing required props / wrong types |
| Connection create fails on localhost | SSRF policy — set `CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS=true` |
| Bearer save fails | Encryption key not configured |
| No live tool cards | AG-UI CUSTOM not parsed / session tool-calls not fetched |
| Queue turn fails on tools | `strict_mcp_tools` — fix selection or connection status |
| Empty/truncated model context from tool | Hit `MAX_RESULT_CHARS` — raise env or fix remote payload size |

---

## Current scope (v1)

- Transport: **Streamable HTTP** only  
- Auto-exec: **`read` only**  
- Progress: AG-UI **`mcp_tool_call`**  
- Selection: turn `mcp_tool_ids` (not session-persisted)

When you extend the client, update `architecture.md` / `authorization.md` in the same PR as the code — that is how humans and agents stay aligned with the security boundary.

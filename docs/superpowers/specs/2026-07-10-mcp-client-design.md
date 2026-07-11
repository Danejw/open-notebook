# MCP Client Feature Design

**Date:** 2026-07-10  
**Status:** Approved for implementation  
**Stack:** FastAPI + SurrealDB + Next.js + LangGraph + AG-UI (Open Notebook conventions)

## Goal

Allow authenticated instance users to connect remote Model Context Protocol (MCP) servers over Streamable HTTP, discover tools, selectively attach tools to a chat message, and let the model execute only those authorized tools during that turn — with audit history and safe secret handling.

This application acts as an **MCP client**. Building or changing an MCP server exposed by Open Notebook is out of scope.

## Decisions

| Topic | Decision |
|-------|----------|
| Ownership | Instance-global (password auth), same as Skills/Credentials; optional nullable `owner` reserved for future multi-tenant ACL |
| Transport (v1) | Streamable HTTP only; transport field structured for later additions |
| Auth types (v1) | `none` \| `bearer`; bearer token Fernet-encrypted at rest; never returned to browser |
| Chat surfaces | Notebook chat + source chat only |
| Tool loop | LangGraph native `bind_tools` + bounded ToolNode loop; stream via AG-UI `TOOL_CALL_*` |
| Action / unknown tools | Visible in picker as disabled; **not executable** until confirmation interrupt exists |
| SSRF | Block private/loopback/link-local/metadata by default; opt-in via `OPEN_NOTEBOOK_MCP_ALLOW_PRIVATE_URLS=true` |
| Duplicate tool names | Runtime aliases include connection identity: `mcp__<conn_short>__<tool_name>` |
| UI | Manage → Tools list + detail pages (`/tools`, `/tools/[id]`) |
| Ask surface | Deferred |
| Human-in-the-loop confirm | Deferred (action/unknown disabled instead) |

## Phase 1 audit — how MCP fits existing systems

| Concern | Existing pattern | MCP fit |
|---------|------------------|---------|
| Auth | `PasswordAuthMiddleware` (shared password; no user IDs) | Instance-scoped connections; no per-resource ACL |
| Secrets | `Credential` + `encrypt_value` / `decrypt_value` (Fernet) | Same encryption for MCP bearer tokens; public DTOs expose `has_auth_config` only |
| Persistence | `ObjectModel` + numbered `.surrealql` migrations | `mcp_connection`, `mcp_tool`, `chat_tool_call` via migration 18 |
| Chat lifecycle | AG-UI SSE via `ag_ui_agents.py`; graphs in `chat.py` / `source_chat.py` | Shared allowlist + tool loop in both graphs; Ask unchanged |
| Message model | LangGraph checkpoint messages (`id`, `type`, `content`) | Selected tools in user-message metadata / session payload; audit in `chat_tool_call`; AG-UI tool events for live UI |
| Structured output | Ask strategy JSON only today; chat is free text | Prefer LangGraph tool-calling over ad-hoc JSON `tool_requests` |
| Tools today | `tools=[]` everywhere; AG-UI `TOOL_CALL_*` typed but unused | First real in-process tool loop |
| UI patterns | Skills list/detail, `SkillPicker`, `ConfirmDialog`, shadcn Card/Badge | Mirror for Tools + `ToolPicker` + tool-call cards |
| Logging | loguru | Safe operational logs; never tokens/auth headers/full sensitive results |
| Timeouts | Long Axios timeout; no shared backend HTTP timeout util | Central MCP request timeouts in domain client |

### Chat paths requiring parity

| Path | v1 MCP? |
|------|---------|
| Notebook chat (`POST /api/chat/execute`) | Yes |
| Source chat (`POST .../messages`) | Yes |
| Ask streaming / `/ask/simple` | No (deferred) |
| Transformations / prompt / ingestion | No |

## Architecture

```
Frontend (Tools UI, ToolPicker, tool-call cards, AG-UI handlers)
    ↓ REST / SSE
API routers + services (mcp_*, chat/source_chat accept mcp_tool_ids)
    ↓
open_notebook/mcp/  (server-only domain)
  transport · url/ssrf · risk · allowlist · discovery · execution · audit helpers
    ↓                    ↓
SurrealDB            Remote MCP (Streamable HTTP)
    ↓
LangGraph chat.py / source_chat.py — bind allowlisted read tools → bounded loop → AG-UI
```

Shared domain layer is mandatory. Routers, UI, and graphs must not reimplement transport or authorization.

## Data model

### `mcp_connection`

- id, name, endpoint_url
- transport (`streamable_http`)
- auth_type (`none` \| `bearer`)
- auth_config (encrypted object; server-only; e.g. `{ "token": "..." }`)
- status (`unknown` \| `connected` \| `error` \| `disconnected`)
- server_info (object\|null), capabilities (object\|null)
- last_connected_at, last_synced_at, last_error (bounded safe string)
- owner (optional string\|null — unused for ACL in v1)
- created, updated

### `mcp_tool`

- id, connection (record link)
- name (MCP tool name), title, description
- input_schema, output_schema (object\|null), annotations (object\|null)
- risk_level (`read` \| `action` \| `unknown`)
- available (bool), last_discovered_at
- owner (optional string\|null — unused for ACL in v1)
- created, updated
- Unique by `(connection, name)`; sync marks missing tools `available=false` (never hard-delete on sync)

### `chat_tool_call`

- id, session_id, message_id (assistant message id when known)
- connection_id, tool_id (nullable after deletes)
- denormalized: tool_name, connection_name, risk_level, runtime_name
- arguments (object), raw_result (object\|null), result_text (bounded string\|null)
- status (`requested` \| `running` \| `succeeded` \| `failed` \| `rejected`)
- error (bounded safe string\|null)
- created, updated

Historical rows must remain readable after connection/tool removal.

## Domain modules (`open_notebook/mcp/`)

| Module | Responsibility |
|--------|----------------|
| `url_safety.py` | Scheme allowlist, reject embedded credentials, private/loopback/metadata checks, env opt-in |
| `transport.py` | Streamable HTTP JSON-RPC: initialize, initialized, tools/list, tools/call; session header; JSON + SSE parse; no redirects; timeouts; no auth logging |
| `client.py` | Session facade over transport |
| `risk.py` | Annotation-first risk classification; conservative name/description inference |
| `result_text.py` | Bound MCP results to model-safe text; keep raw separately for audit |
| `schema_validate.py` | Validate arguments against input_schema before remote call |
| `discovery.py` | Initialize → list tools → upsert → mark unavailable → update connection sync fields |
| `allowlist.py` | Reload selected ids, filter available + read-only executable, build unique runtime aliases |
| `execution.py` | Bounded loop helpers, duplicate-call guard, audit status transitions |
| `public.py` | Safe public DTOs (no secrets) |
| `limits.py` | Central constants: max selected tools, max iterations, max calls, timeouts, max result chars |

### MCP protocol (v1)

Supported operations: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`.

Transport requirements: MCP Streamable HTTP headers, protocol version negotiation per current MCP spec support in this codebase, capture/propagate `Mcp-Session-Id`, accept JSON object, JSON array, and SSE frames, normalize errors safely.

### Risk & execution policy (v1)

| Risk | Picker | Executable |
|------|--------|------------|
| `read` | Selectable | Yes (if selected + available) |
| `action` | Visible, disabled | No |
| `unknown` | Visible, disabled | No |

Selecting a tool in the composer is not approval for destructive behavior. Confirmation interrupt is deferred.

### SSRF policy

Always: http/https only; no userinfo in URL; disable redirects; request timeouts; validate resolved destination as far as practical.

Default deny: loopback, private RFC1918, link-local, IPv6 unique-local, cloud metadata addresses.

Allow private/loopback only when `OPEN_NOTEBOOK_MCP_ALLOW_PRIVATE_URLS=true`.

## API (high level)

- `GET/POST /mcp/connections`
- `GET/DELETE /mcp/connections/{id}`
- `POST /mcp/connections/{id}/test`
- `POST /mcp/connections/{id}/sync` (test + discover/refresh tools)
- `PUT /mcp/connections/{id}/auth` (replace bearer token; never returns old token)
- `GET /mcp/connections/{id}/tools`
- `GET /mcp/tools/selectable` (available tools for chat picker; safe metadata only)
- Chat execute (notebook + source): accept `mcp_tool_ids: string[]`; store selection metadata on the user turn; run allowlist + tool loop

Public connection responses include auth_type and `has_auth_config`, never the token.

## Chat runtime

1. Client sends `mcp_tool_ids` with the message (transient selection).
2. Backend validates count ≤ max; reloads tools; drops missing/unavailable/non-read.
3. Builds runtime allowlist with unique aliases including connection identity.
4. Binds only allowlisted tools on the chat model; runs a bounded tool loop.
5. For each request: create `chat_tool_call` → running → validate args → MCP call → succeeded/failed/rejected; emit AG-UI tool events; append bounded result to working messages.
6. Reject off-allowlist or duplicate identical calls without contacting MCP.
7. Stop on normal assistant answer or iteration/call limits.

Authorization source of truth is the server-built allowlist only — never model-supplied names alone, browser IDs alone, or cached client catalogs.

## UI

### Manage → Tools

- List: name, endpoint, status, auth type, has credentials, available tool count, last connected/synced, last error; actions open / test / sync / remove (confirm)
- Add dialog: name, URL, auth type, bearer field when needed; validation + loading states
- Detail `/tools/[id]`: server info, capabilities, status, discovery status, tool table (availability, risk, description, collapsed schemas/annotations), refresh
- Credential edit: dedicated replace flow; never prefill existing token

### Chat

- `ToolPicker` beside skills: group by connection; title/name; short description; risk badge; multi-select; chips for selected; reset/preserve per existing composer behavior
- Action/unknown shown disabled with short explanation
- Assistant history: collapsible tool-call cards (name, connection, status, risk, expandable args/result, safe error); render from audit + denormalized fields after connection delete

## Observability

Log: connection attempts, discovery attempts, call duration, statuses, timeouts, parse failures, rejection reasons.

Never log: bearer tokens, Authorization headers, secret-looking argument values, full sensitive tool results.

Structured counters (log fields or simple metrics): connect success/fail, tools discovered/unavailable, calls by status, duration, timeouts, unauthorized rejects, duplicate-call rejects.

## Testing

- Fake MCP server: initialize, initialized, tools/list, tools/call, JSON + SSE, success/error/delay/malformed, catalog changes
- Unit: URL/SSRF, redirects disabled, bearer handling, redaction, parsers, session id propagation, timeouts, discovery sync (unavailable), allowlist, duplicate names across connections, schema validation, limits, duplicate-call prevention, audit survival, history rehydration
- Integration: notebook + source chat parity for select → execute → card

### Manual verification checklist

1. Add MCP server without auth → test → sync → tools appear with risk  
2. Select one read tool in notebook chat → model calls it → result used → card in history  
3. Unselected tool request → rejected, no remote contact  
4. Bearer server → token absent from browser responses, logs, message metadata  
5. Remove tool from fake catalog → sync → unavailable; gone from selectable  
6. Delete connection → picker empty for those tools; old cards still render  
7. Timeout → failed safely; model continues  
8. Two connections, same tool name → correct server called; no auth bypass  
9. Action tool → not executable (disabled / rejected)

## Out of scope (v1)

- Multi-tenant ownership/ACL
- Action/unknown confirmation (human-in-the-loop)
- Ask / search MCP integration
- Additional transports (stdio, legacy SSE)
- OAuth / dynamic client registration for MCP
- Exposing an MCP server from Open Notebook
- Letting MCP tools write Open Notebook internal data except via the remote tool’s own behavior

## Implementation order

1. Domain models + migration + public DTOs  
2. Transport client + URL/SSRF + risk + result_text  
3. Connection CRUD, test, encrypted auth  
4. Discovery/sync + selectable tools API  
5. Tools list/detail UI  
6. Chat ToolPicker + `mcp_tool_ids` plumbing  
7. Allowlist + LangGraph tool loop (notebook + source)  
8. Audit + AG-UI tool-call rendering  
9. Hardening, fake server, automated + manual verification

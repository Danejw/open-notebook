# MCP Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Streamable HTTP MCP client connections, tool discovery, chat tool selection/execution (read-only), audit history, and Tools UI for project + source chat.

**Architecture:** Shared `construction_os/mcp/` domain (transport, SSRF, risk, allowlist, discovery, execution); SurrealDB models; FastAPI `/mcp/*`; LangGraph `bind_tools` loop in `chat.py` / `source_chat.py`; AG-UI `TOOL_CALL_*`; Tools list/detail + `ToolPicker`.

**Tech Stack:** FastAPI, SurrealDB, httpx, LangGraph/LangChain tools, Next.js, TanStack Query, AG-UI

**Spec:** `docs/superpowers/specs/2026-07-10-mcp-client-design.md`

---

## File map

| Path | Role |
|------|------|
| `construction_os/mcp/limits.py` | Central limits/constants |
| `construction_os/mcp/url_safety.py` | URL + SSRF validation |
| `construction_os/mcp/risk.py` | Risk classification |
| `construction_os/mcp/result_text.py` | Bound result text for model |
| `construction_os/mcp/schema_validate.py` | Argument schema validation |
| `construction_os/mcp/transport.py` | Streamable HTTP JSON-RPC + SSE parse |
| `construction_os/mcp/client.py` | Session facade |
| `construction_os/mcp/public.py` | Safe public dict builders |
| `construction_os/mcp/discovery.py` | Tool sync |
| `construction_os/mcp/allowlist.py` | Runtime allowlist + aliases |
| `construction_os/mcp/execution.py` | Audit + call helpers + duplicate guard |
| `construction_os/mcp/langgraph_tools.py` | Build LangChain tools from allowlist |
| `construction_os/domain/mcp.py` | McpConnection, McpTool, ChatToolCall |
| `construction_os/database/migrations/18.surrealql` | Schema |
| `api/mcp_service.py` | Service orchestration |
| `api/mcp_models.py` | Pydantic request/response |
| `api/routers/mcp.py` | HTTP routes |
| `api/routers/chat.py` / `source_chat.py` | Accept `mcp_tool_ids` |
| `api/ag_ui_agents.py` | Pass tools into run input if needed |
| `construction_os/graphs/chat.py` / `source_chat.py` | Tool loop |
| `tests/test_mcp_*.py` | Unit + fake server tests |
| `tests/fixtures/fake_mcp_server.py` | Fake MCP HTTP server |
| `frontend/src/lib/api/mcp.ts` | API client |
| `frontend/src/lib/hooks/use-mcp.ts` | React Query hooks |
| `frontend/src/app/(dashboard)/tools/**` | List + detail pages |
| `frontend/src/components/mcp/**` | Cards, dialogs, ToolPicker, ToolCallCard |
| `frontend/src/lib/locales/*` | i18n keys (all 14 locales; en-US complete, others mirror keys) |

---

### Task 1: Pure domain helpers + tests (TDD)

**Files:** `construction_os/mcp/{limits,url_safety,risk,result_text,schema_validate,public}.py`, `tests/test_mcp_url_safety.py`, `tests/test_mcp_risk.py`, `tests/test_mcp_result_text.py`, `tests/test_mcp_schema_validate.py`

- [ ] Implement limits constants (max selected tools=8, max iterations=6, max calls=12, request timeout=30s, max result chars=8000, max error chars=500)
- [ ] URL safety: http/https only; reject userinfo; block private/loopback/link-local/metadata unless `CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS=true`
- [ ] Risk: annotations first (`readOnlyHint` → read; `destructiveHint`/`openWorldHint` mutating → action); else infer from name/description keywords
- [ ] result_text + schema_validate
- [ ] Tests pass: `uv run pytest tests/test_mcp_url_safety.py tests/test_mcp_risk.py tests/test_mcp_result_text.py tests/test_mcp_schema_validate.py -v`

### Task 2: Transport + client + fake server

**Files:** `construction_os/mcp/transport.py`, `client.py`, `tests/fixtures/fake_mcp_server.py`, `tests/test_mcp_transport.py`

- [ ] httpx client: no redirects, timeout, bearer header, `Mcp-Session-Id`, Accept JSON+SSE
- [ ] Parse JSON object, array, SSE frames; MCP errors → safe app errors
- [ ] Methods: initialize, initialized notification, list_tools, call_tool
- [ ] Fake server supports success/error/delay/SSE/malformed/catalog change
- [ ] Tests: session propagation, parsing, timeout, bearer not logged

### Task 3: Domain models + migration 18

**Files:** `construction_os/domain/mcp.py`, `migrations/18.surrealql`, `18_down.surrealql`, `async_migrate.py`, register subclasses for polymorphic get

- [ ] McpConnection with encrypted auth_config (Fernet JSON blob or token field)
- [ ] McpTool unique query helpers; ChatToolCall audit model
- [ ] Migration creates tables + indexes

### Task 4: Discovery + allowlist + execution helpers

**Files:** `discovery.py`, `allowlist.py`, `execution.py`, `langgraph_tools.py`, tests

- [ ] Sync upserts tools; marks missing unavailable
- [ ] Allowlist: reload ids, filter available+read, alias `mcp__{conn_id_safe}__{tool_name}`
- [ ] Audit create/update statuses; duplicate (runtime_name, args) guard
- [ ] LangChain `@tool` / StructuredTool wrappers that call execution layer

### Task 5: API service + router

**Files:** `api/mcp_models.py`, `api/mcp_service.py`, `api/routers/mcp.py`, `api/main.py`

- [ ] CRUD, test, sync, replace auth, list tools, selectable
- [ ] Never return tokens; `has_auth_config` only
- [ ] Wire router `/api/mcp/...`

### Task 6: Chat graph tool loop

**Files:** `construction_os/graphs/chat.py`, `source_chat.py`, `api/routers/chat.py`, `source_chat.py`, `ag_ui_agents.py`, prompts if needed

- [ ] Accept `mcp_tool_ids` on execute
- [ ] State field for allowlist/runtime tools
- [ ] After context: if tools, bind_tools + ToolNode loop with limits
- [ ] Persist chat_tool_call rows; surface tool messages for AG-UI
- [ ] Endpoint to list tool calls for a session (for history cards)

### Task 7: Frontend Tools manage UI

**Files:** `frontend/.../tools/**`, `lib/api/mcp.ts`, `hooks/use-mcp.ts`, sidebar, i18n

- [ ] List + detail pages; add dialog; confirm delete; test/sync actions
- [ ] Auth replace dialog (no token prefill)

### Task 8: Chat ToolPicker + tool-call cards

**Files:** `ToolPicker.tsx`, `ToolCallCard.tsx`, `useProjectChat.ts`, `useSourceChat.ts`, `ChatColumn`, `ChatPanel`, AG-UI event handlers

- [ ] Selectable tools query; group by connection; disable action/unknown
- [ ] Pass `mcp_tool_ids` on send
- [ ] Render TOOL_CALL_* live + hydrate from audit API for history

### Task 9: Verify

- [ ] `uv run pytest tests/test_mcp_*.py -v`
- [ ] Manual checklist from spec (as feasible with fake server)
- [ ] Document known limitations in plan completion notes

**Deferred:** multi-tenant ACL, action confirmation HITL, Ask MCP, extra transports, OAuth

# AG-UI CUSTOM event catalog (Construction OS)

Pinned names and payloads for `type: "CUSTOM"` events on the chat / Ask streams.

**Wire shape:** `{ "type": "CUSTOM", "name": "<event>", "value": { … } }`  
**Emitter pattern:** LangGraph `dispatch_custom_event` / `adispatch_custom_event` → `ag-ui-langgraph` → SSE / queue

Related: [events.md](./events.md) · [extending.md](./extending.md)

---

## Cos CUSTOM events

| Name | When | Payload (`value`) | Client parser |
|------|------|-------------------|---------------|
| **agent_progress** | Skills, context retrieval, Ask strategy/search/write | `{ phase, step, detail?, message? }` | `parseAgentProgressEvent` |
| **mcp_tool_call** | MCP tool audit snapshot (start → result/error) | Public tool-call fields (`tool_name`, `status`, …) | `parseMcpToolCallEvent` |
| **a2ui** | A2UI v0.9 surface messages (feature-flagged) | `{ messages, surfaceId, messageId? }` | `parseA2uiEvent` → surface store |

### agent_progress

**Constants:** `AGENT_PROGRESS_EVENT` in `construction_os/graphs/progress.py` and `frontend/src/lib/ag-ui/progress.ts`

| Field | Values |
|-------|--------|
| `phase` | `started` \| `progress` \| `completed` |
| `step` | `loading_skills`, `retrieving_context`, `generating`, `strategy`, `provide_answer`, `write_final_answer`, or free string |
| `detail` | Step-specific counts/names (skills, tokens, search term, …) |
| `message` | Optional fallback status string |

**UX:** `started`/`progress` → live status line; `completed` → activity log line (when formatter returns non-null).

**Emitters:** `emit_agent_progress` / `aemit_agent_progress` from chat, source_chat, ask graph nodes.

### mcp_tool_call

**Constants:** `MCP_TOOL_CALL_EVENT` in `construction_os/mcp/progress.py` and `frontend/src/lib/ag-ui/mcp-tool-calls.ts`

**Value:** sanitized audit via `public_tool_call` — at minimum `tool_name` + `status`; also id, session/message ids, connection, risk, arguments, result_text, error, timestamps.

**UX:** Upserted into live MCP tool-call list; merged with persisted calls for message grouping.

**Emitter:** `emit_mcp_tool_call(audit, config)` from MCP execution.

Full client stack (allowlist, risk, transport): [docs/ai-protocols/mcp/client/](../mcp/client/architecture.md).

### a2ui

**Constant:** `A2UI_EVENT = "a2ui"` (`frontend/src/lib/a2ui/constants.ts`, backend `a2ui_emit.py`)

**Flags:** `A2UI_CHAT_ENABLED` + `NEXT_PUBLIC_A2UI_CHAT`

**Value:** A2UI v0.9 message list + surface binding. Full catalog and extension checklist: [docs/ai-protocols/a2ui/](../a2ui/extending.md).

Do not put A2UI protocol details here — keep this file to the AG-UI transport contract.

---

## Hard rules

1. Reuse these names; do not invent synonyms (`progress`, `tool_call`, …).
2. Put structured data in `value`, not in `name`.
3. Keep payloads JSON-serializable and bounded (A2UI has explicit size caps; progress/MCP should stay small).
4. Always pass LangGraph `config` into emitters so `ag-ui-langgraph` can forward the custom event.
5. Parse on the client in the shared `CUSTOM` branch (`chat-sse-handlers` or Ask’s switch) — one parser per name.
6. Document every new CUSTOM name in this file in the same PR as the emitter + parser.

How to add the next CUSTOM event without rebuilding the stack: [extending.md](./extending.md).

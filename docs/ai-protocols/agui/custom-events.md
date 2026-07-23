# AG-UI CUSTOM event catalog (Construction OS)

Pinned names and payloads for `type: "CUSTOM"` events on the project chat stream.

**Wire shape:** `{ "type": "CUSTOM", "name": "<event>", "value": { … } }`  
**Emitter pattern:** LangGraph `dispatch_custom_event` / `adispatch_custom_event` → `ag-ui-langgraph` → SSE / queue

Related: [events.md](./events.md) · [extending.md](./extending.md)

---

## Cos CUSTOM events

| Name | When | Payload (`value`) | Client parser |
|------|------|-------------------|---------------|
| **agent_progress** | Skills, context retrieval, generation | `{ phase, step, detail?, message? }` | `parseAgentProgressEvent` |
| **mcp_tool_call** | MCP tool audit snapshot (start → result/error) | Public tool-call fields (`tool_name`, `status`, …) | `parseMcpToolCallEvent` |
| **a2ui** | A2UI v0.9 surface messages (feature-flagged) | `{ messages, surfaceId, messageId? }` | `parseA2uiEvent` → surface store |
| **evidence_focus** | After chat context retrieval (RAG-012) | `{ items: [{ sourceId, chunkId?, page?, charStart?, charEnd?, excerpt? }] }` | `parseEvidenceFocusEvent` → citation focus store |

### agent_progress

**Constants:** `AGENT_PROGRESS_EVENT` in `construction_os/graphs/progress.py` and `frontend/src/lib/ag-ui/progress.ts`

| Field | Values |
|-------|--------|
| `phase` | `started` \| `progress` \| `completed` |
| `step` | `loading_skills`, `retrieving_context`, `generating`, `verifying_citations`, or free string |
| `detail` | Step-specific counts/names (skills, tokens, citationViolations, …) |
| `message` | Optional fallback status string |

**`verifying_citations` detail (RAG-015):** emitted after citation strip in `generate_with_tools`:

| Field | Meaning |
|-------|---------|
| `citationViolations` | Count of citations removed (not in turn evidence) |
| `removedCitationIds` | Removed IDs (capped server-side) |
| `keptCitationCount` | Count of citations that matched allowed evidence |

**UX:** `started`/`progress` → live status line; `completed` → activity log line (when formatter returns non-null).

**Emitters:** `emit_agent_progress` / `aemit_agent_progress` from project chat graph nodes; `emit_citation_verify_progress` from `tool_runtime/chat_loop.py` after RAG-002 strip.

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

### evidence_focus

**Constants:** `EVIDENCE_FOCUS_EVENT` in `construction_os/graphs/progress.py` and `frontend/src/lib/ag-ui/evidence-focus.ts`

**Value:** `{ items: EvidenceFocusItem[] }` where each item may include `sourceId` (required), `chunkId`, `page`, `charStart`, `charEnd`, `excerpt`.

**UX:** Stored in `useCitationFocusStore`; citation click on a source opens `SourceDialog` with PDF/text deep-link focus.

**Emitter:** `emit_evidence_focus(items, config)` from project chat `retrieving_context` after `build_relevance_context`.

---

## Hard rules

1. Reuse these names; do not invent synonyms (`progress`, `tool_call`, …).
2. Put structured data in `value`, not in `name`.
3. Keep payloads JSON-serializable and bounded (A2UI has explicit size caps; progress/MCP should stay small).
4. Always pass LangGraph `config` into emitters so `ag-ui-langgraph` can forward the custom event.
5. Parse on the client in the shared `CUSTOM` branch (`chat-sse-handlers` or Ask’s switch) — one parser per name.
6. Document every new CUSTOM name in this file in the same PR as the emitter + parser.

How to add the next CUSTOM event without rebuilding the stack: [extending.md](./extending.md).

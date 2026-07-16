# AG-UI events (Construction OS)

What the chat / Ask clients consume from AG-UI SSE today.

**Protocol:** [AG-UI](https://docs.ag-ui.com) (camelCase wire JSON over SSE `data:` lines)  
**Bridge:** `ag-ui-langgraph` (`LangGraphAgent`) over project chat, source chat, and Ask graphs  
**Related:** [custom-events.md](./custom-events.md) · [extending.md](./extending.md) · [A2UI docs](../a2ui/extending.md)

AG-UI is the **agent ↔ frontend stream**. A2UI is an optional UI payload carried inside AG-UI `CUSTOM` events named `a2ui`.

---

## Rules the stream must follow

1. Wire events are JSON objects with a string `type` (see below).
2. Text deltas arrive as `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_CHUNK` with a string `delta` (fallback: `content`).
3. Failures surface as `RUN_ERROR` with a user-facing `message` (API encodes classified errors).
4. Domain extras use `CUSTOM` with a stable `name` + `value` — see [custom-events.md](./custom-events.md).
5. Live HTTP and the chat queue share the same runtime (`iterate_agent_events`); only the transport differs (SSE vs persisted snapshots).

---

## Core protocol events we handle

| Event | Purpose | Client behavior |
|-------|---------|-----------------|
| **STEP_STARTED** | LangGraph / agent step label | Sets live status via `agentStepI18nKey(stepName)` |
| **STEP_FINISHED** | Step complete | No-op today (progress UI prefers `agent_progress`) |
| **TEXT_MESSAGE_START** | New AI message | Creates empty AI bubble; binds pending A2UI surfaces |
| **TEXT_MESSAGE_CONTENT** / **TEXT_MESSAGE_CHUNK** | Token stream | Appends delta (RAF-batched) |
| **TEXT_MESSAGE_END** | Message complete | Project chat flushes buffers; source chat may skip |
| **STATE_SNAPSHOT** | Graph state dump | Source chat: context indicators via `onStateSnapshot` |
| **RUN_FINISHED** | Run complete | Clears status; project chat also flushes/clears buffers |
| **RUN_ERROR** | Fatal run error | Throws; UI shows classified message |
| **CUSTOM** | Extensions | Progress, MCP tool calls, A2UI — see custom-events |

Also typed on the client but not specially handled in the shared chat switch: `RUN_STARTED`, `MESSAGES_SNAPSHOT`, `STATE_DELTA`, `TOOL_CALL_*`, `RAW`. Queue persistence still watches several of these for snapshots.

### Shared client switch

**File:** `frontend/src/lib/hooks/chat-sse-handlers.ts` → `createAgUiChatSseHandler`

Used by project + source chat (`useChatSendTurn`). Ask (`use-ask.ts`) has a thinner inline switch (steps + progress + text + run lifecycle).

---

## Agents & HTTP entrypoints

| Agent name | Graph | HTTP helper | Typical route |
|------------|-------|-------------|----------------|
| `project_chat` | `construction_os/graphs/chat.py` | `ag_ui_agents.project_chat_agent` | Project chat send (SSE) |
| `source_chat` | `construction_os/graphs/source_chat.py` | `ag_ui_agents.source_chat_agent` | Source chat send (SSE) |
| `ask` | `construction_os/graphs/ask.py` | `ag_ui_agents.ask_agent` | `POST /search/ask` (SSE) |

Agents are built in `construction_os/graphs/ag_ui_runtime.py` and rebound on API startup after the AsyncSqliteSaver checkpointer is attached (`refresh_agents()`).

### Run input

`build_run_input(...)` constructs `ag_ui.core.RunAgentInput`:

- `thread_id` — LangGraph thread / session id
- `run_id` — new UUID per run
- `messages` — usually one AG-UI `UserMessage`
- `state` — optional
- `forwarded_props` — Cos-specific request bag (context, skills, MCP tools, artifact metadata, …)
- `tools` / `context` — empty lists today (tools come from graph/MCP, not AG-UI tool defs)

---

## Two execution paths

```
Live turn (HTTP)
  → router builds RunAgentInput
  → ag_ui_streaming_response (EventEncoder → SSE)
  → readAgUiSseStream → createAgUiChatSseHandler / useAsk

Queued turn (worker)
  → chat queue runner
  → iterate_agent_events (same LangGraphAgent.clone().run)
  → persist text / CUSTOM / progress into queue item snapshots
  → UI drains via queue polling (not live SSE)
```

Do not fork a third event dialect for the queue — reuse runtime events and map them into snapshots.

---

## Adding events

Do not invent a parallel SSE format. Prefer:

1. An existing AG-UI core type when it fits, or
2. A new **CUSTOM** `name` documented in [custom-events.md](./custom-events.md)

Follow the checklist in [extending.md](./extending.md).

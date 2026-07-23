# Extending AG-UI in Construction OS

How agent ↔ frontend streaming works today, and how to add **new CUSTOM events or wire another graph** without rebuilding the stack.

**Protocol:** [AG-UI](https://docs.ag-ui.com) over SSE (`data: {json}`)  
**LangGraph bridge:** `ag-ui-langgraph` (`LangGraphAgent`)  
**Not the same as:** A2UI (declarative UI) or A2A (agent-to-agent). A2UI rides *on* AG-UI as `CUSTOM` name `a2ui`.

Related docs: [events.md](./events.md) (what we handle) · [custom-events.md](./custom-events.md) (CUSTOM contract) · [docs/ai-protocols/a2ui/](../a2ui/extending.md) (generative UI)

---

## Mental model

AG-UI is the **streaming session protocol**. LangGraph runs the agent; Cos encodes events to SSE (or persists them in the chat queue). The frontend is protocol-first: parse events, update messages / status / tools / surfaces.

```
LangGraph graph node
  → dispatch_custom_event / text / steps
  → LangGraphAgent.run (ag-ui-langgraph)
  → EventEncoder (HTTP)  OR  queue_runner snapshots
  → SSE `data:` lines
  → readAgUiSseStream / consumeAgUiSseBuffer
  → createAgUiChatSseHandler
  → UI: messages, stream status, activity log, MCP chips, A2UI surfaces
```

**Fallback path:** chat queue uses the **same** `iterate_agent_events` runtime when a live SSE turn cannot own the session. Do not invent a second event schema for the worker.

---

## What you already get (do not rebuild)

| Layer | Responsibility | Extend by… |
|-------|----------------|------------|
| `ag_ui_runtime` | Agents, `build_run_input`, `iterate_agent_events` | New agent = `build_agent(name, graph)` + refresh |
| `api/ag_ui_agents` | SSE encode + `RUN_ERROR` classification | Call `ag_ui_streaming_response` from a router |
| Progress emitter | `agent_progress` CUSTOM | New `step` string + client formatters |
| MCP progress | `mcp_tool_call` CUSTOM | Emit from execution; client upsert already generic |
| A2UI on AG-UI | `a2ui` CUSTOM | Follow [docs/ai-protocols/a2ui/extending.md](../a2ui/extending.md) |
| SSE parser | Buffer → `AgUiEvent` | Usually nothing |
| Chat SSE handler | Shared switch for project chat | New CUSTOM name → parser branch |
| Queue runner | Persist AG-UI deltas into queue items | Map new CUSTOM into snapshot fields if UI needs history |

Anti-patterns to reject:

- A second SSE dialect or NDJSON format beside AG-UI for chat
- Duplicating stream parsers (use `createAgUiChatSseHandler` + options)
- Emitting CUSTOM without a documented `name` / client parser
- Treating AG-UI `state` as the system of record (SurrealDB + checkpointer remain authoritative)
- Calling model APIs from the frontend “because streaming is hard” — extend the graph + CUSTOM events instead

---

## Checklist: add a CUSTOM event

Use this every time. Order matters.

### 1. Decide the contract

Write down before coding:

- **Name** (stable snake_case string, one source of truth on both sides)
- **When** nodes emit it (phases / triggers)
- **`value` shape** (TypedDict / Pydantic / TS interface)
- **Live UX** (status line, log, panel, ignore)
- **Persistence** (queue snapshot? message metadata? none?)
- **Size / PII** bounds

Prefer extending `agent_progress` or `mcp_tool_call` when the UX is the same kind of signal.

### 2. Emit from the graph (or MCP layer)

```python
from langchain_core.callbacks.manager import dispatch_custom_event

MY_EVENT = "my_event"

def emit_my_event(payload: dict, config: RunnableConfig | None = None) -> None:
    if not config:
        return
    dispatch_custom_event(MY_EVENT, payload, config=config)
```

Mirror the existing helpers in `construction_os/graphs/progress.py` / `construction_os/mcp/progress.py` — one module owns the name + emitter.

Pass `config` from the LangGraph node so `ag-ui-langgraph` can forward the event.

### 3. Parse on the client

**File:** `frontend/src/lib/ag-ui/<feature>.ts`

- Export `MY_EVENT` constant matching the backend
- `parseMyEvent(event: AgUiEvent): MyPayload | null` — guard `event.name` + `value` shape
- Keep types strict (no `any`)

### 4. Wire the shared SSE handler

**File:** `frontend/src/lib/hooks/chat-sse-handlers.ts`

Inside `case 'CUSTOM':`, parse and update the right piece of UI state. Prefer shared helpers over copying the switch.

If only one surface needs it, use `onCustomEvent` — but still document the name in [custom-events.md](./custom-events.md).

### 5. Queue persistence (if history matters)

**File:** `construction_os/chat/queue_runner.py`

Live SSE users see CUSTOM immediately; queued turns only retain what the runner snapshots. If the UI must show the signal after refresh/drain, teach the runner to fold your CUSTOM `value` into the item’s progress / tool-call / payload fields (follow existing `agent_progress` / MCP handling).

### 6. Docs + tests

Update **all** of:

1. `docs/ai-protocols/agui/custom-events.md` — name, payload, parser
2. `docs/ai-protocols/agui/events.md` — only if you add a new **core** `type` (rare)
3. Unit tests: backend emit shape; frontend parser; handler branch (`chat-sse-handlers.test.ts`, queue tests if persisted)

### 7. Ship

No feature flag required for core progress/MCP. A2UI remains dual-flagged. Restart API if `API_RELOAD=false` after changing graph emit modules.

---

## Checklist: wire a new LangGraph agent to AG-UI

### 1. Runtime agent

**File:** `construction_os/graphs/ag_ui_runtime.py`

```python
my_agent = build_agent("my_feature", my_module.graph)
```

Include it in `refresh_agents()`.

### 2. HTTP surface (if live SSE)

**File:** `api/ag_ui_agents.py` — re-export / alias the agent like `project_chat_agent`.

**Router:**

```python
return ag_ui_agents.ag_ui_streaming_response(
    ag_ui_agents.my_agent,
    ag_ui_runtime.build_run_input(
        thread_id=...,
        message=...,
        forwarded_props={...},
    ),
    configurable={...},
)
```

Prefer importing `build_run_input` from `ag_ui_runtime` (canonical) or a thin re-export on `ag_ui_agents` — one call site style per PR, not both.

### 3. Frontend consumer

- Reuse `readAgUiSseStream` + `createAgUiChatSseHandler`
- Do not copy-paste a third SSE buffer parser

### 4. Checkpointer

Chat-like threads need AsyncSqliteSaver (see API lifespan + `refresh_agents`).

---

## File map (canonical)

```
construction_os/graphs/ag_ui_runtime.py   # agents, build_run_input, iterate_agent_events, clone
construction_os/graphs/progress.py        # emit agent_progress
construction_os/graphs/a2ui_emit.py       # emit a2ui CUSTOM (optional UI)
construction_os/mcp/progress.py           # emit mcp_tool_call
construction_os/chat/queue_runner.py      # non-HTTP consumer of iterate_agent_events

api/ag_ui_agents.py                       # EventEncoder SSE + RUN_ERROR
api/routers/chat.py                       # project chat → project_chat_agent
api/routers/search.py                     # POST /search retrieval (not AG-UI)

frontend/src/lib/ag-ui/
  events.ts                               # AgUiEvent types, SSE buffer/stream reader, step i18n
  progress.ts                             # agent_progress parse + status/log formatters
  mcp-tool-calls.ts                       # mcp_tool_call parse + list merge helpers
  a2ui.ts                                 # thin re-export → lib/a2ui parsers

frontend/src/lib/hooks/
  chat-sse-handlers.ts                    # shared CUSTOM / text / run switch
  useChatSendTurn.ts                      # live turn ownership + readAgUiSseStream
```

---

## Event shape reminder

SSE line:

```text
data: {"type":"CUSTOM","name":"agent_progress","value":{"phase":"started","step":"generating","detail":{}}}
```

Text streaming:

```text
data: {"type":"TEXT_MESSAGE_START","messageId":"…"}
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"…","delta":"Hello"}
data: {"type":"TEXT_MESSAGE_END","messageId":"…"}
data: {"type":"RUN_FINISHED"}
```

Client parsing is line-oriented: incomplete trailing buffer is kept across reads (`consumeAgUiSseBuffer`).

---

## Debugging (short)

| Symptom | Likely cause |
|---------|----------------|
| No stream / hung UI | API not healthy on `:5055`, or worker idle while turn was queued |
| Status stuck on step name | Missing `agent_progress` completed, or STEP_STARTED without CUSTOM progress |
| RUN_ERROR toast | Graph exception → `classify_error` message in `stream_agent_events` |
| CUSTOM ignored | Wrong `name`, parser guard failed, or Ask handler missing the branch chat has |
| A2UI missing | Flags off, or see [docs/ai-protocols/a2ui/extending.md](../a2ui/extending.md) debugging |
| Queue item empty progress | Runner not mapping that CUSTOM into snapshots |
| Duplicate parsers diverge | New code path didn’t use `createAgUiChatSseHandler` / shared `lib/ag-ui/*` |

---

## Current CUSTOM catalog

**agent_progress**, **mcp_tool_call**, and optional **a2ui**. See [custom-events.md](./custom-events.md).

When you add the next CUSTOM event or agent, update `custom-events.md` and (if needed) `events.md` in the same PR as the code checklist above — that is how humans and agents stay aligned with the wire protocol.

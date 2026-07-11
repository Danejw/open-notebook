# AG-UI Streaming Implementation Plan

> **For agentic workers:** Implement tasks in order. Spec: `docs/superpowers/specs/2026-07-10-ag-ui-streaming-design.md`

**Goal:** Replace-in-place AG-UI event streams for notebook chat, source chat, and Ask via `ag-ui-langgraph`, with thin domain adapters and existing React UI.

## Status

Implemented in the same change set as this plan (user requested immediate implementation).

### Done

- [x] Add `ag-ui-langgraph` dependency
- [x] `api/ag_ui_agents.py` — agents + SSE helper
- [x] Ask graph: `MemorySaver` + rename entry node to `strategy`
- [x] Thin adapters: `chat.py`, `source_chat.py`, `search.py`
- [x] Frontend: `lib/ag-ui/events.ts`, Next `/api/chat/execute` proxy
- [x] Hooks: `useNotebookChat`, `useSourceChat`, `useAsk`
- [x] UI status line + `agentSteps` en-US i18n

### Manual verification

- [ ] Notebook chat: step status + assistant text (or refetch after `RUN_FINISHED`)
- [ ] Source chat: same + context indicators via `STATE_SNAPSHOT`
- [ ] Ask: strategy / answers / final from `STATE_SNAPSHOT` + step labels
- [ ] Error path shows `RUN_ERROR` message

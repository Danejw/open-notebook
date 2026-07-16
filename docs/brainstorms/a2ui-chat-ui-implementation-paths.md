# A2UI Chat UI — Implementation Paths

**Date:** 2026-07-15  
**Mode:** Implementation (A2UI Implementation Specialist)  
**Protocol pin:** **A2UI v0.9.1** (current production) via `@a2ui/react` `/v0_9` path. Do **not** mix v0.8 / v0.9.x / v1.0 candidate message shapes.  
**Related:** Architecture options live in [`a2ui-chat-ui-options.md`](./a2ui-chat-ui-options.md). This doc answers *how to ship code*, not which product mode to pick.

---

## Current-state assessment (code-backed)

| Fact | Location | Implication |
|---|---|---|
| Chat already streams AG-UI SSE | `frontend/src/lib/ag-ui/events.ts` (`readAgUiSseStream`), `useProjectChat` / `useSourceChat` | Carry A2UI JSONL as `CUSTOM` events — do not add a second transport |
| Shared SSE switch already exists | `frontend/src/lib/hooks/chat-sse-handlers.ts` | Extend `CUSTOM` beside `agent_progress` + MCP tool-call parsers; hook via `onCustomEvent` |
| Messages are markdown-only | `api/routers/chat.py` `ChatMessage` = `{ id, type, content }`; same shape in `frontend/src/lib/types/api.ts` | Surfaces need a sidecar field or ephemeral client store for reload |
| Quasi-generative UI exists | `ChatMessageRow` + `TemplateHtmlPreview` + `extractHtmlFromChatContent` | Keep templates for static docs; use A2UI for *interactive* flows |
| Tool UI mount point exists | `ToolCallCard` under AI bubbles | Optional later attach point (MCP Surfaces mode) |
| Agent runtime | `construction_os/graphs/ag_ui_runtime.py` + `api/ag_ui_agents.py` + LangGraph chat graphs | Emit A2UI from graph nodes / CUSTOM events through existing AG-UI encoder |
| A2UI packages | Absent from `frontend/package.json` | Greenfield renderer install + catalog negotiation |

**Stability boundary (never generate):** sidebar, session switcher, model / skill / MCP pickers, queue controls, auth, destructive deletes. A2UI only inside assistant message / task panels.

**First vertical slice (shared across paths):** “Confirm / refine context after retrieval” — agent returns a surface with selected sources + a missing-field form instead of prose-only confirmation. Markdown text remains the fallback beside the surface.

---

## Path 1 — The Fixture-First Slice (“Live Pipe”)

### Concept

Ship the smallest end-to-end loop: pin v0.9.1 → render a **recorded fixture** in `ChatMessageRow` → parse the same payload from AG-UI `CUSTOM` → emit from one LangGraph path. Persistence and domain catalog come later.

### High-level architecture

```text
Fixture JSONL (tests + Story-like mount)
  -> A2uiMessageProcessor + in-memory surface store (keyed by messageId / surfaceId)
  -> ChatMessageRow mounts <A2uiSurface /> under AI bubble
  -> chat-sse-handlers CUSTOM name "a2ui" (or activity) applies streamed lines
  -> project_chat graph emits fixture-equivalent CUSTOM after retrieval
  -> local functions (expand / copy) | userAction events -> next AG-UI run
  -> markdown content always present as fallback
```

**Touches (concrete):**

| Layer | Files / areas |
|---|---|
| Packages | `frontend/package.json` — `@a2ui/react` (v0_9), catalog schemas as needed |
| New module | `frontend/src/lib/a2ui/` — processor, surface store, catalog ID pin, URL/action policy |
| SSE | `chat-sse-handlers.ts`, `chat-sse-handlers.test.ts`, optional `ag-ui/a2ui.ts` parser |
| UI | `ChatMessageRow.tsx` (+ memo comparator for surface props), project `ChatColumn` if needed |
| Agent | `construction_os/graphs/chat.py` (or small helper under `graphs/a2ui_emit.py`), `api/ag_ui_agents.py` only if encoder helpers needed |
| Tests | Fixture replay unit tests; one SSE integration test with recorded JSONL |
| Flag | Env / session flag e.g. `NEXT_PUBLIC_A2UI_CHAT=1` (no flag system today — keep it a single env gate) |

**Out of scope for this path:** SurrealDB message schema changes, queue replay of surfaces, custom Cos catalog beyond 1–2 themed Basic Catalog wrappers.

### Pros

- Fastest proof that generative UI belongs in Construction OS chat
- Reuses SSE, queue UX, and progress patterns already in hooks
- Failure is cheap: flag off → markdown-only as today

### Cons

- Surfaces vanish on session reload until Path 2-style persistence
- Basic Catalog may look generic until theming / Cos components land
- Risk of “demo debt” if the fixture never graduates to real agent generation

### Complexity estimate

**Low–Medium** — mostly frontend wiring + one CUSTOM emitter; low schema risk.

### Strategic fit

Choose when you need a 1–2 week vertical slice to validate interaction quality before investing in catalog or persistence.

💡 Unique insight: `createAgUiChatSseHandler` already has `onCustomEvent` — A2UI can land without forking project vs source SSE switches.

⚖ Trade-off: Speed vs durability; users who refresh mid-review lose the interactive surface.

---

## Path 2 — The Durable Surfaces Path (“Persistence-First”)

### Concept

Treat A2UI as first-class chat message data from day one. Extend message / session persistence so surfaces survive reload, queue workers, and shared-chat guests — then mount the renderer against stored payloads, not only live SSE.

### High-level architecture

```text
Agent emits A2UI JSONL over AG-UI CUSTOM (same as Path 1)
  -> API chat / source_chat / queue runner persists a2ui_payload (or attachments[]) on the AI message
  -> Session GET returns content + a2ui sidecar
  -> Frontend hydrates surface store from history, then applies live stream patches
  -> Actions: local functions | events back into AG-UI run with surfaceId + idempotency key
  -> Validation twice: agent-side schema check before emit; client-side before render
```

**Touches (concrete):**

| Layer | Files / areas |
|---|---|
| Schema | `api/routers/chat.py` + `source_chat.py` `ChatMessage` models; `frontend/src/lib/types/api.ts` (`ProjectChatMessage` / `SourceChatMessage`) |
| DB | New Surreal migration under `migrations/` for message attachment / `a2ui_payload`; domain chat session persistence paths |
| Queue | Chat queue message merge (`chat-queue-messages`, queue worker tests in `tests/test_chat_queue_worker.py`) — ensure completed queue items hydrate surfaces |
| Shared chat | Guest session responses must include sidecar or explicitly strip it |
| Frontend | Same `lib/a2ui/` as Path 1, plus hydrate-from-history in `useProjectChat` / `useSourceChat` |
| Agent | Emit + **validate** before send; store final JSONL (or compact snapshot) with the message on `RUN_FINISHED` |
| CI | Size/complexity budgets; fixture + reload integration test |

**First vertical slice still applies**, but the definition of done includes: refresh the page → surface still interactive (or safely degraded to markdown + “UI unavailable”).

### Pros

- Production-shaped from the start (research sessions are long-lived)
- Aligns with privacy-first / self-hosted expectations: UI state is user data, not a transient animation
- Avoids a painful second migration after users rely on live-only surfaces

### Cons

- Slower first demo; schema + queue + guest paths multiply edge cases
- Must define merge semantics for streamed patches vs stored snapshot
- Larger blast radius if message shape changes break clients

### Complexity estimate

**High** — cross-cutting API, DB, queue, and frontend hydration.

### Strategic fit

Choose when A2UI is a core product bet and Construction OS’s chat history / queue maturity means ephemeral UI would feel broken.

💡 Unique insight: Chat queue already merges synthetic messages into the timeline — surfaces that only exist in the live SSE buffer will desync from queue UX unless persistence is designed up front.

⚖ Trade-off: Correctness and reload vs time-to-first-interactive-demo.

---

## Path 3 — The Template-Successor Path (“Replace Interactive HTML”)

### Concept

Product-led implementation: do not add A2UI as a parallel novelty. Target the existing structured-output path (`html_template_id` → HTML extraction → `TemplateHtmlPreview`) and replace **interactive** cases with a small Construction OS catalog, while keeping static HTML templates for document-like output.

### High-level architecture

```text
Session has html_template_id OR a2ui_catalog_intent (feature gate)
  -> Agent grounded on Cos catalog (SourceResultCard, CitationList, ExtractedFieldReview, NoteDraftForm, …)
  -> A2UI stream for interactive review / approve / edit / reject
  -> ChatMessageRow: if a2ui surface present → A2uiSurface; else if HTML extracted → TemplateHtmlPreview; else markdown
  -> Actions write through trusted APIs (save note, open source) — never raw HTML/JS injection
  -> Gradually deprecate interactive HTML-in-markdown patterns
```

**Touches (concrete):**

| Layer | Files / areas |
|---|---|
| Catalog | `frontend/src/lib/a2ui/catalog/` + shadcn wrappers; `scripts`/CI lint modeled on catalog lint practices |
| UI branching | `ChatMessageRow.tsx`, `MessageActions`, template hooks (`use-html-documents`) |
| Agent prompts | Chat system prompts / tools that today steer toward HTML template fill |
| Session fields | May add `a2ui_enabled` or reuse skill selection rather than overloading `html_template_id` |
| Security | Strict allowlist: no free-form HTML in A2UI path; URL policy; confirmations for writes |
| Docs | User-facing note that interactive structured chat uses generative UI; templates remain for static bids/docs |

**First vertical slice:** “Review extracted claims with citations” (approve / edit / reject) — the workflow where HTML preview is weakest because it is not a real form.

### Pros

- Clear user outcome and migration story (evolves a known pain, not a tech spike)
- Forces a semantic catalog early → better generation quality and brand fit
- Stronger security narrative vs continuing to extract HTML from model prose

### Cons

- Requires product decisions on when templates vs A2UI apply
- Heavier design/accessibility work before a visible win
- Risk of dual systems (HTML + A2UI) confusing users if gating is fuzzy

### Complexity estimate

**Medium–High** — catalog + product migration + agent grounding; persistence can start ephemeral then harden.

### Strategic fit

Choose when the goal is research-workflow differentiation (NotebookLM-style text dumps → trusted interactive review), not merely protocol adoption.

💡 Unique insight: `ChatMessageRow` already branches on template preview vs markdown — A2UI is a third branch in the same place, not a new chat shell.

⚖ Trade-off: Highest product fit vs slower “hello world”; requires catalog discipline from day one.

---

## Comparison

| | Path 1 Fixture-First | Path 2 Durable Surfaces | Path 3 Template-Successor |
|---|---|---|---|
| Primary question answered | “Can we render + act?” | “Does it survive reload/queue?” | “Does it beat HTML templates for interaction?” |
| Protocol | v0.9.1 on AG-UI CUSTOM | Same + stored snapshot | Same + Cos catalog |
| Persistence | Deferred | Day one | Optional early; required before template cutover |
| Catalog | Basic + light theme | Basic or Cos | Cos semantic required |
| Complexity | Low–Medium | High | Medium–High |
| Demo speed | Fastest | Slowest | Medium |

---

## Recommended starting point

Given current maturity (AG-UI streaming, CUSTOM handlers, MCP cards, HTML templates, chat queue):

**Execute Path 1 for the first PR series, with Path 3’s catalog discipline and a hard stop before broad rollout until Path 2’s sidecar exists.**

### Concrete sequence (implementation order)

1. **Pin** A2UI v0.9.1 / `@a2ui/react/v0_9`; document catalog ID in `frontend/src/lib/a2ui/constants.ts`.
2. **Fixture mount** in `ChatMessageRow` behind `NEXT_PUBLIC_A2UI_CHAT` — no model involved.
3. **SSE parse** in `chat-sse-handlers` for `CUSTOM` name `a2ui` (payload = JSONL lines or batched messages); unit-test with recorded stream.
4. **Emit** the same fixture from project chat graph after a retrieval/context step via existing AG-UI CUSTOM channel.
5. **Add 2–3 Cos components** (Path 3 lite): e.g. `SourceChipList`, `MissingFieldForm`, `ConfirmActions` — shadcn-backed, stable IDs.
6. **Wire one action loop**: local function (toggle) + one agent event (`confirm_context`) that continues the run.
7. **Before external users:** Path 2 minimum — `a2ui_payload` on AI messages + hydrate on session load; markdown fallback if validation fails.
8. **Defer** MCP-attached surfaces (`ToolCallCard`) until one tool clearly needs a native form ([architecture Path 3](./a2ui-chat-ui-options.md)).

### Success metrics

- Task completion vs text-only for context confirm / claim review
- Validation failure rate (agent + client)
- Fallback frequency (render errors → markdown)
- No focus theft during stream; keyboard path for primary actions
- Zero unregistered component / URL escapes
- After Path 2: surface present after full page reload for ≥95% of successful generations

### Out of scope for v1

- Regenerating the app shell
- A2A multi-agent surface routing
- A2UI v1.0 RPC (`actionResponse` / `callFunction`)
- Replacing the chat queue protocol
- Replacing static HTML bid templates wholesale

### ADR stub (fill when implementing)

| Decision | Value |
|---|---|
| Protocol version | A2UI v0.9.1 |
| Renderer | `@a2ui/react` `/v0_9` |
| Transport | Existing AG-UI SSE (`CUSTOM` / activity) |
| Agent framework | LangGraph via `ag_ui_langgraph` |
| First surface | Context confirm / refine after retrieval |
| Rollout flag | `NEXT_PUBLIC_A2UI_CHAT` (and matching API gate if needed) |

---

## References

- A2UI home: https://a2ui.org/
- Spec (production): https://a2ui.org/specification/v0.9.1-a2ui/
- AG-UI: https://ag-ui.com/
- Architecture brainstorm: [`a2ui-chat-ui-options.md`](./a2ui-chat-ui-options.md)
- Skill: `a2ui-implementation-specialist`
`)
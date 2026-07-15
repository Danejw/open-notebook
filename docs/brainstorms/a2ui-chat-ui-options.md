# A2UI for Construction OS Chat — Three Paths

**Date:** 2026-07-15  
**Mode:** Architecture (A2UI Implementation Specialist)  
**Scope:** How to add Google's A2UI generative UI protocol to project and source chat

## Current-state assessment

Construction OS already has the right *transport* for A2UI, but not the protocol or renderer.

| Layer | Today | A2UI implication |
|---|---|---|
| Transport | AG-UI SSE via `ag-ui-langgraph` and `readAgUiSseStream` | Prefer carrying A2UI on this stream — do **not** add a second agent channel |
| Custom events | `agent_progress`, MCP tool-call audits | Natural place to add `a2ui` CUSTOM / activity payloads |
| Message model | `{ id, type, content }` markdown only | Surfaces need optional attachment / sidecar storage for reload |
| Quasi-generative UI | HTML templates + `TemplateHtmlPreview` | Parallel pattern; A2UI should replace arbitrary HTML for *interactive* flows; keep templates for static docs |
| Design system | Radix / shadcn + Tailwind | Catalog must map to these components, not invent a second look |
| Protocol pin (as of 2026-07-15) | — | Target **A2UI v0.9.1** + `@a2ui/react/v0_9`; treat v1.0 as candidate only |

**Stability boundary (keep deterministic):** sidebar, session switcher, model / skill / MCP pickers, queue controls, auth, destructive deletes. A2UI only inside assistant message / task panels.

**Does not exist today:** A2UI packages, surface store, catalog negotiation, or agent-authored component trees.

---

## Path 1 — The AG-UI Express Path

### Concept

Ship the smallest end-to-end A2UI slice on the existing AG-UI pipe: official React renderer + Basic Catalog + one interactive surface under the AI bubble.

### High-level architecture

```text
useProjectChat / useSourceChat
  -> existing AG-UI SSE
  -> CUSTOM (or activity) events carrying A2UI JSONL (v0.9.1)
  -> A2uiMessageProcessor + surface store (per messageId / surfaceId)
  -> ChatMessageRow mounts <A2uiSurface />
  -> local functions (expand, copy) | userAction events back into next AG-UI run
  -> markdown text remains fallback alongside the surface
```

**Touches:** `frontend/src/lib/ag-ui/*`, `useProjectChat` / `useSourceChat`, `ChatMessageRow`, `api/ag_ui_agents.py` and chat graph nodes that emit CUSTOM events, optional fixture endpoint for replay.

**First vertical slice:** “Confirm / refine context” — after retrieval, the agent returns a surface with selected sources and a missing-field form instead of only prose.

### Pros

- Matches A2UI guidance for React + AG-UI apps
- Reuses SSE, queue, and progress UX
- Fastest path to a real interaction loop

### Cons

- Basic Catalog feels generic without theming work
- HTML-template and A2UI may coexist awkwardly at first
- Session reload of surfaces is deferred

### Complexity estimate

**Medium** — integration risk on event encoding and version pin; product surface still small.

### Strategic fit

Choose when you want proof that generative UI belongs in Construction OS chat before investing in a domain catalog.

💡 Unique insight: `useProjectChat` already parses `CUSTOM` events — A2UI can land beside `agent_progress` without rewriting the stream client.

⚖ Trade-off: Speed vs brand-fit components; users may see “generic agent UI” unless theming is tight.

---

## Path 2 — The Domain Catalog Path

### Concept

Treat the **component catalog** as the product contract. Build a Construction OS catalog mapped to shadcn (`SourceResultCard`, `CitationList`, `ExtractedFieldReview`, `NoteDraftForm`, `ContradictionTable`), fixture-driven before any model generation.

### High-level architecture

```text
Catalog (JSON schema + React registry)
  -> agent instructions constrained to catalog IDs
  -> AG-UI stream of A2UI messages (same transport as Path 1)
  -> renderer only registers Cos catalog + minimal layout primitives
  -> actions: local (toggle citation) vs event (save note, open source, queue follow-up)
  -> SurrealDB: optional a2ui_payload on chat message / queue item for replay
```

**Touches:** new `frontend/src/lib/a2ui/` (catalog, registry, lint), shadcn wrappers, chat graph prompt/tooling, persistence on chat session / queue runner, catalog lint in CI.

**First vertical slice:** “Review extracted claims with citations” — structured approve / edit / reject of agent findings linked to sources (beats markdown checklists).

### Pros

- Highest UX fit for research workflows
- Better security via a narrow component allowlist
- Lower generation error rate than a sprawling primitive catalog
- Differentiates from NotebookLM-style text dumps

### Cons

- More upfront design work
- Slower first demo
- Catalog governance becomes ongoing work

### Complexity estimate

**High** — catalog design + persistence + agent grounding + accessibility for custom components.

### Strategic fit

Choose when A2UI is a core product bet for research workflows, not a tech spike.

💡 Unique insight: The HTML-template path already proves users want structured output — a semantic catalog is the safe evolution of that idea without raw HTML injection.

⚖ Trade-off: Catalog breadth vs token/schema cost; start tiny (5–8 components) or generation quality collapses.

---

## Path 3 — The MCP Surfaces Path

### Concept

Keep chat **text-first**. Emit A2UI only when an allowlisted MCP tool (or internal tool) returns an interactive result — search hits, schema forms, dashboards — rendered as a surface attached to that tool call.

### High-level architecture

```text
User chat (markdown AG-UI text)
  -> MCP tool executes (existing allowlist)
  -> tool result includes application/a2ui+json (or resource URI)
  -> ToolCallCard / sibling A2uiSurface mounts for that tool_call_id
  -> actions route to tool follow-up or trusted API, not free-form model HTML
```

**Touches:** `construction_os/mcp/*`, `ToolCallCard`, MCP progress CUSTOM events, optional MCP resource fetch; chat graphs mostly unchanged for pure Q&A.

**First vertical slice:** One high-value tool (structured source search or artifact preview) returns a comparison surface instead of dumping JSON into the model’s prose.

### Pros

- Strong security story (allowlist already exists)
- Clear “when UI vs text” rule
- Less risk of chat shell churn
- Aligns with A2UI-over-MCP guides

### Cons

- Chat will not feel generative for ordinary turns
- Two mental models (text vs tool UI)
- Weaker for agent-initiated wizards that lack a tool

### Complexity estimate

**Medium** — MCP MIME/resource plumbing + renderer; less chat UX rewrite.

### Strategic fit

Choose when interactive UI must stay tightly coupled to privileged tool results, or you want A2UI without teaching the main chat agent to author UIs yet.

💡 Unique insight: MCP tool-call cards already create a “structured attachment” slot in the message timeline — an ideal mount point for surfaces.

⚖ Trade-off: Safety and clarity vs ambient generative chat; the product still feels mostly text-only.

---

## Recommended starting point

Given current maturity (AG-UI streaming, CUSTOM events, MCP cards, HTML templates, nascent chat queue):

**Start with Path 1 for a 1–2 week vertical slice, but steal Path 2’s catalog discipline from day one.**

### Concrete sequence

1. Pin **A2UI v0.9.1** / `@a2ui/react/v0_9`; verify AG-UI event shape against current docs (CUSTOM vs activity snapshot).
2. Replay a **fixture surface** in `ChatMessageRow` with no model involved.
3. Emit the same fixture from the LangGraph agent as a CUSTOM event on one project-chat path.
4. Replace Basic Catalog pieces with **2–3 Cos semantic components** (Path 2 lite) for the first real workflow: citation/source confirmation or extracted-field review.
5. Keep markdown fallback; do not touch HTML templates until A2UI proves safer for interactive cases.
6. Defer Path 3 until a specific MCP tool clearly needs a native form — then attach surfaces to `ToolCallCard`.

### Success metrics

- Task completion vs text-only for the chosen slice
- Validation failure rate
- Fallback frequency
- No focus theft during stream
- Zero unregistered component / URL escapes

### Out of scope for v1

- Regenerating the app shell
- A2A multi-agent UI
- A2UI v1.0 RPC actions
- Replacing the chat queue protocol

---

## References

- A2UI home: https://a2ui.org/
- A2UI v0.9.1 (current production); v1.0 candidate
- React renderer: `@a2ui/react` (`/v0_9` path)
- Adjacent: AG-UI https://ag-ui.com/, MCP https://modelcontextprotocol.io/
- Skill: `a2ui-implementation-specialist` (personal skill)
`)
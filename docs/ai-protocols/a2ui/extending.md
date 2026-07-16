# Extending A2UI in Construction OS

How project chat interactive UI works today, and how to add **new Cos components** without rebuilding the stack.

**Protocol:** A2UI v0.9 (not A2A — Agent-to-Agent is a separate transport protocol)  
**Catalog ID:** `https://www.construction-os.ai/a2ui/catalogs/cos/v1/catalog.json`  
**Flags:** `A2UI_CHAT_ENABLED` (API) + `NEXT_PUBLIC_A2UI_CHAT` (frontend)

Related docs: [components.md](./components.md) (what exists) · [agent-catalog.md](./agent-catalog.md) (prompt contract) · [AG-UI transport](../agui/extending.md)

---

## Mental model

A2UI is a **declarative UI protocol**. The agent describes allowed components + data. The client renders **trusted** React components from a fixed catalog. The model never injects arbitrary HTML/JSX.

```
Agent / graph
  → A2UI v0.9 messages (createSurface / updateComponents / updateDataModel)
  → AG-UI CUSTOM event name "a2ui" (SSE)
  → surface-store (policy validate → MessageProcessor)
  → A2uiSurface + Cos/Basic React components
  → user action → formatA2uiActionMessage → chat sendMessage
```

**Fallback path:** if the model pastes catalog JSON into chat text, `parse-inline-a2ui.ts` normalizes it through the **same allowlist** and strips it from the markdown bubble. You do **not** write a new parser per component.

**Client-facing text:** `display-chat-content.ts` strips wire tags (`[A2UI:…]`), protocol call leaks, and embedded JSON. Markdown for normal AI replies stays intact (no muted “bubble” wrapper).

---

## What you already get (do not rebuild)

| Layer | Responsibility | Extend by… |
|-------|----------------|------------|
| Basic catalog | Layout/content/inputs from `@a2ui/react` | Usually nothing — already registered |
| Cos catalog | Domain components (`AskUser` today) | Add React impl + register name |
| Policy allowlist | Security boundary | Add the component **name** in two places |
| Inline JSON recovery | Model dumps JSON in prose | Automatic once name is allowlisted |
| Display sanitization | Hide wire/protocol noise | Usually automatic; only special-case new **action wire** formats if needed |
| Agent catalog prompt | Teaches the model what it may emit | Update `format_a2ui_agent_catalog()` + docs |
| SSE / store / surface mount | Transport + render host | Leave alone |

Anti-patterns to reject:

- One-off parsers or renderers for a single new widget
- Letting the model invent component names not in the allowlist
- Putting protocol names (`a2ui.createSurface()`) or raw JSON in user-visible chat
- Auto-emitting a surface on every turn unless product explicitly wants that (we removed context-confirm for this reason)
- Treating A2UI data model as the system of record

---

## Checklist: add a Cos component

Use this every time. Order matters.

### 1. Decide the contract

Write down before coding:

- **When** the agent should use it (one sentence)
- **Props** (literals vs `{ "path": "/…" }` bindings)
- **Children** (if any) — prefer Basic `Column`/`Row` as `root`
- **Events** the client may dispatch (name + context fields)
- **Text fallback** the model should still write in markdown
- **Wire message** shape if the action loops back into chat (`[A2UI:event_name] …`)

Prefer one semantic Cos component over a pile of Basic primitives when the pattern is stable.

### 2. Implement the React component

**File:** `frontend/src/components/a2ui/cos-components.tsx`

- Follow the `AskUser` pattern: `defineCosComponent('YourName', …)`
- Resolve dynamic props with `context.dataContext.resolveDynamicValue` / path bindings for editable fields
- Dispatch actions via `context.dispatchAction({ event: { name, context } })`
- Use existing shadcn/ui primitives for look-and-feel
- Keep IDs stable and semantic (`root`, `ask-user`, …) — not random per render

### 3. Register in the Cos catalog

**File:** `frontend/src/lib/a2ui/catalog/cos-catalog.ts`

```ts
const cosComponents = [AskUser, YourName] as ReactComponentImplementation[]
```

### 4. Allowlist the name (security)

Both must match:

| Side | File | Symbol |
|------|------|--------|
| Frontend | `frontend/src/lib/a2ui/policy.ts` | `ALLOWED_COMPONENT_NAMES` |
| Backend | `construction_os/graphs/a2ui_emit.py` | `ALLOWED_COMPONENT_NAMES` |

Inline parse + policy + emit validation all key off these sets. Miss one side and you get “Interactive UI unavailable” or silent skip.

### 5. Teach the agent

Update **all** of:

1. `format_a2ui_agent_catalog()` in `construction_os/graphs/a2ui_emit.py` (injected into `prompts/chat/system.jinja` when A2UI is on)
2. `docs/ai-protocols/a2ui/agent-catalog.md`
3. `docs/ai-protocols/a2ui/components.md`

Keep the prompt short: name, when to use, props, event, hard rules (root id, no invented components, no JSON in chat text).

### 6. Optional: backend builder

**File:** `construction_os/graphs/a2ui_emit.py`

Add `build_your_feature_messages(...)` that returns the v0.9 message list (`createSurface` → `updateComponents` → `updateDataModel`), mirroring `build_ask_user_messages`.

Call `emit_a2ui(messages, config, …)` from a graph node **only** when product requires a deterministic surface. Prefer catalog + agent judgment for clarifying UIs.

### 7. Optional: action → chat wire format

**File:** `frontend/src/lib/a2ui/format-action-message.ts`

If the component dispatches a new event name, format a `[A2UI:your_event] …` string the model can recognize. Keep technical detail in the **wire** payload; `display-chat-content.ts` should show a short human answer (answer/label), not tags or option ids.

Project chat already routes actions through `useProjectChat` → `sendMessage`.

### 8. Tests

Minimum:

- Backend: allowlist + builder (if any) in `tests/test_a2ui_emit.py`
- Frontend: policy accepts the component; rejects unknown names — `frontend/src/lib/a2ui/a2ui.test.ts`
- If new wire/display rules: cases in `display-chat-content` / action formatter tests

### 9. Ship flags + restart

- API: `A2UI_CHAT_ENABLED=true` (restart API if `API_RELOAD=false`)
- UI: `NEXT_PUBLIC_A2UI_CHAT=1`
- Hard-refresh; use a **new** chat session so old payloads do not hydrate removed components

Dev preview: `?a2ui_fixture=1` loads `frontend/src/lib/a2ui/fixtures/load-ask-user.ts` — add or swap fixtures for new components the same way.

---

## File map (canonical)

```
construction_os/graphs/a2ui_emit.py     # catalog prompt, allowlist, builders, emit_a2ui
construction_os/graphs/chat.py          # injects a2ui_catalog into system prompt
prompts/chat/system.jinja               # INTERACTIVE UI (A2UI) section

frontend/src/components/a2ui/
  cos-components.tsx                    # Cos React implementations
  A2uiMessageSurface.tsx                # mounts surfaces under a message

frontend/src/lib/a2ui/
  catalog/cos-catalog.ts                # Catalog registration
  policy.ts                             # client allowlist + budgets
  surface-store.ts                      # MessageProcessor + apply/hydrate
  parse-a2ui-event.ts                   # CUSTOM event → messages
  parse-inline-a2ui.ts                  # prose/JSON → protocol (catalog-generic)
  display-chat-content.ts               # client-facing text sanitization
  format-action-message.ts              # action → chat wire string
  use-inline-a2ui.ts                    # hook: display + ingest
  hydrate.ts                            # session history → surfaces
  fixtures/load-ask-user.ts             # ?a2ui_fixture=1
  constants.ts                          # catalog id, flags, event name
```

---

## Message shape reminder (v0.9)

Every surface:

1. `createSurface` — unique `surfaceId`, Cos `catalogId`, usually `sendDataModel: true`
2. `updateComponents` — include a component with **`id: "root"`** (required by `A2uiSurface`)
3. `updateDataModel` — put interactive values in the data model; bind props with `{ "path": "/…" }`

Example skeleton:

```json
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "feature-<unique>",
      "catalogId": "https://www.construction-os.ai/a2ui/catalogs/cos/v1/catalog.json",
      "sendDataModel": true
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "feature-<unique>",
      "components": [
        { "id": "root", "component": "Column", "children": ["main"] },
        { "id": "main", "component": "YourName", "title": { "path": "/title" } }
      ]
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "feature-<unique>",
      "path": "/",
      "value": { "title": "…" }
    }
  }
]
```

---

## Debugging (short)

| Symptom | Likely cause |
|---------|----------------|
| “Interactive UI unavailable” | Name not in policy allowlist, bad catalogId, or failed `MessageProcessor` |
| JSON visible in chat | Display strip failed mid-stream, or content is not valid catalog JSON |
| Markdown flattened / ugly | Do not collapse whitespace in `formatChatContentForDisplay` for AI prose |
| Action does nothing | `setActionHandler` not wired, or unknown event in `formatA2uiActionMessage` |
| Surface missing after refresh | No `a2ui_payload` and no recoverable inline JSON in message content |
| Model invents old widgets | Agent catalog / prompt still lists them — remove from prompt + allowlist |

---

## Current Cos catalog

Only **AskUser** plus the Basic catalog. See [components.md](./components.md) and [agent-catalog.md](./agent-catalog.md).

When you add the next Cos component, update those two docs in the same PR as the code checklist above — that is how the AI (and humans) stay aligned with the renderer.

# A2UI components (Construction OS)

What the chat agent can put on an interactive surface today.

**Protocol:** A2UI v0.9  
**Catalog:** Cos (`https://www.construction-os.ai/a2ui/catalogs/cos/v1/catalog.json`)  
**Flag:** `A2UI_CHAT_ENABLED` + `NEXT_PUBLIC_A2UI_CHAT`

Related: [agent-catalog.md](./agent-catalog.md) · [extending.md](./extending.md)

## Rules the surface must follow

1. Every surface needs a component with id **`root`** (the React mount looks only for that id).
2. Prefer a `Column` (or `Row`) as `root`, then nest children by id.
3. Only components listed below are allowed — anything else is rejected by policy.
4. Bind dynamic values with `{ "path": "/field" }` against the surface data model.
5. Surface ids must be unique per turn (e.g. `ask-user-<uuid>`).

---

## Cos semantic

| Component | Purpose | Key props | Action |
|-----------|---------|-----------|--------|
| **AskUser** | Clarify before answering — multi-choice + free text | `question`, `options`, `customValue`, `selectedOptionId`, `customPlaceholder`, `submitLabel` | `ask_user_answer` |

### AskUser

Use when the model needs a clear answer from the user before continuing.

**Options shape:** `{ id, label, recommended? }` — `recommended: true` options render first (with a “Recommended” tag).

**UX:**
- Tap a suggested answer → submits immediately
- Or type a custom answer → Submit

**Action payload (`ask_user_answer`):** `question`, `answer`, `optionId`, `optionLabel`, `customText`

**Minimal tree:**

```
root (Column)
└── ask-user (AskUser)
      question ← /question
      options  ← /options
      customValue ← /customText
      selectedOptionId ← /selectedOptionId
```

Backend helper: `build_ask_user_messages(question=..., options=[...])`.

---

## Basic catalog (also allowed)

| Kind | Components |
|------|------------|
| **Layout** | `Row`, `Column`, `List`, `Card`, `Tabs`, `Modal`, `Divider` |
| **Content** | `Text`, `Image`, `Icon`, `Video`, `AudioPlayer` |
| **Input** | `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput` |

Use Basic components to structure Cos ones (e.g. `Column` wrapping `AskUser`).

## Agent context

The project-chat system prompt injects this catalog when `A2UI_CHAT_ENABLED` is on (see `format_a2ui_agent_catalog()` and `prompts/chat/system.jinja`).

Canonical short form for humans + agents: [agent-catalog.md](./agent-catalog.md).

## Inline JSON recovery

If the model pastes catalog JSON into chat text (shorthand `{ "component": "…" }` trees, fenced protocol arrays, etc.), the client strips it from the markdown bubble and normalizes it through the same Cos catalog allowlist into A2UI v0.9 surfaces. New components work once added to `ALLOWED_COMPONENT_NAMES` — no per-component parsers.

## Adding components

Do not rebuild transport, store, or parsers. Follow the checklist in [extending.md](./extending.md).

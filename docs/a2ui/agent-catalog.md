# A2UI agent catalog (Construction OS)

Pinned for project chat. **Protocol:** A2UI v0.9  
**Catalog ID:** `https://www.construction-os.ai/a2ui/catalogs/cos/v1/catalog.json`

## Cos component

| Name | When to use | Props | Event |
|------|-------------|-------|-------|
| **AskUser** | Clarify before answering | `question`, `options` (`{id,label,recommended?}`), `customValue`, `selectedOptionId` | `ask_user_answer` |

**AskUser UX:** recommended options first; tap submits; free-text + Submit for “none of these”.

**`ask_user_answer` context:** `question`, `answer`, `optionId`, `optionLabel`, `customText`

## Basic components (also allowed)

`Row`, `Column`, `List`, `Card`, `Tabs`, `Modal`, `Divider`, `Text`, `Image`, `Icon`, `Video`, `AudioPlayer`, `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`

## Hard rules

1. Every surface needs component id **`root`** (usually a `Column`).
2. Use only components from this list.
3. Unique `surfaceId` per turn.
4. Prefer AskUser over long clarifying prose when the user must choose.
5. Always keep a markdown text fallback beside any interactive surface.
6. Never paste component JSON into chat text — use A2UI v0.9 protocol messages only.

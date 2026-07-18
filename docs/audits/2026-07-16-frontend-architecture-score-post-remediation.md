# Frontend Architecture Score: 72/100

**Previous score:** 64/100 (2026-07-16 pre-remediation baseline in `docs/audits/2026-07-16-frontend-architecture-score.md`)
**Change:** +8
**Audit coverage:** 87% — High coverage
**Comparison status:** Directly comparable — same scoring rubric, similar High coverage (86% → 87%), and the prior scorecard’s UI-013–UI-025 remediations were verified in source before re-scoring
**Architecture trend:** Improving

**Issues found:** 12 (High: 3, Medium: 7, Low: 2)
**Most repeated frontend pattern:** Parallel list-selection state and picker dialog scaffolds, plus residual chat-hook session/send/enqueue duplication after shared helper extraction
**Highest-value refactor:** Extract `useListSelection` for project columns, then finish a shared chat session/send core on top of the existing SSE/queue helpers

---

## Scorecard

| Scoring Category                                 |  Weight | Rating |   Points Earned | Evidence Summary |
| ------------------------------------------------ | ------: | -----: | --------------: | ---------------- |
| Shared Component Reuse                           |      25 |    4.1 |            20.5 | Foundations (`EmptyState`, `ConfirmDialog`, `FieldError`, `PageHeader`, `PageRefreshButton`, `LoadingSkeletons`, `ui/*`) widely adopted after UI-013–UI-017; residual bypasses in picker empties, `SourceInsightDialog`, and a few labeled refresh controls |
| Duplication and One-Off Implementations          |      20 |    3.5 |            14.0 | Podcast panel/form shells and chat streaming helpers reduced twins; remaining clusters are chat hook session flows, column selection logic, and Skill/Tool/Template picker scaffolds |
| Composition and Component API Quality            |      15 |    3.3 |             9.9 | `ChatPanel` now composes focused subcomponents (~253 lines); large surfaces remain (`api-keys/page.tsx` 1433, `SourceCard` 867, `ArtifactsColumn` 825) with prop/callback sprawl |
| Design-System and Styling Consistency            |      15 |    3.5 |            10.5 | Tokenized `globals.css` + ui density conventions; `ConfirmDialog` uses destructive tokens; widespread `text-red-600` / `text-red-500` still bypass `text-destructive` |
| Shared Behavior, State, and Frontend Logic       |      10 |    3.4 |             6.8 | Strong chat helper stack (`useChatQueue`, `chat-sse-handlers`, `useChatStreamingBuffer`, `useChatSessionSelection`); `useProjectChat`/`useSourceChat` still duplicate session CRUD/send/enqueue; toast/error helpers split |
| Accessibility and Responsive Consistency         |      10 |    3.3 |             6.6 | Radix baseline + AppSidebar/SessionManager labels landed; residual unlabeled icon buttons, English `Expand`/`Collapse` aria strings, skills dirty-nav `window.confirm` |
| Validation, Testing, and Component Documentation |       5 |    3.2 |             3.2 | Foundation unit tests added for ConfirmDialog/EmptyState/FieldError/LoadingSkeletons/PageHeader/PageRefreshButton/button; no Storybook; `useProjectChat`/`useSourceChat` and most UI primitives still untested |
| **Total**                                        | **100** |        |       **72/100** |                  |

### Category rating notes

1. **Shared Component Reuse (4.1):** Affirmative evidence of consistent reuse on primary list pages, deletes, forms, and page chrome after the remediation wave. Remaining Medium bypasses (pickers, insight delete UI) keep this below 4.5. No unresolved High issue on a foundational shared component after ConfirmDialog delete migrations.
2. **Duplication (3.5):** Improved from 3.2 as podcast frames and chat SSE/queue helpers landed. Still noticeable clusters in chat hooks and column selection — not dominant, but not isolated.
3. **Composition (3.3):** `ChatPanel` composition is affirmative progress; feature monoliths (`api-keys`, `SourceCard`, columns) still concentrate unrelated responsibilities.
4. **Design-System (3.5):** Main token system is applied; destructive red palette drift is the primary repeated exception.
5. **Shared Behavior (3.4):** Shared chat infrastructure is real and used; unfinished domain-hook consolidation and split toast/error paths cap the rating below 4.
6. **A11y/Responsive (3.3):** Shared Radix dialogs/menus provide a consistent baseline; icon-only and i18n aria gaps remain meaningful but narrower than the prior audit.
7. **Testing/Docs (3.2):** Foundation tests and CLAUDE.md docs are affirmative; coverage of feature hooks and UI primitives remains partial. No Storybook.

### Historical comparison (category ratings)

| Category | Previous | Current | Δ |
| -------- | -------: | ------: | -: |
| Shared Component Reuse | 3.8 | 4.1 | +0.3 |
| Duplication and One-Off Implementations | 3.2 | 3.5 | +0.3 |
| Composition and Component API Quality | 2.8 | 3.3 | +0.5 |
| Design-System and Styling Consistency | 3.3 | 3.5 | +0.2 |
| Shared Behavior, State, and Frontend Logic | 3.0 | 3.4 | +0.4 |
| Accessibility and Responsive Consistency | 2.8 | 3.3 | +0.5 |
| Validation, Testing, and Component Documentation | 2.5 | 3.2 | +0.7 |
| **Total** | **64** | **72** | **+8** |

Rating changes are within the ±1.5 guardrail and are explained by verified UI-013–UI-025 remediations plus newly inspected residual clusters (not coverage inflation).

### Issues resolved since previous audit (verified in source)

| Issue | Verification |
| ----- | ------------ |
| UI-013 | `SourceDetailContent` and `documents/[id]/page` use `ConfirmDialog`; only remaining `window.confirm` is skills dirty-navigation |
| UI-014 | `SourceTypeStep` uses `FieldError` for field messages |
| UI-015 | `PageRefreshButton` exists and is used on major list pages |
| UI-016 | `SessionManager` uses `EmptyState` + loading/a11y patterns |
| UI-017 | `ArtifactsColumn` uses `listActionTriggerClassName` |
| UI-018 | `ProfilePanelFrame` shared by speaker/episode panels |
| UI-019 | `PodcastProfileFormDialogShell` shared by profile forms |
| UI-020 | Shared chat helpers extracted (`chat-sse-handlers`, queue status, streaming buffer, session selection) |
| UI-021 | `ChatPanel` composed into `ChatSessionHeader` / `ChatPanelMessages` / `ChatContextStrip` / `ChatComposer` |
| UI-022 | `AppSidebar` toggle aria-labels + i18n keys |
| UI-023 | `ConfirmDialog` destructive Button/token classes (test asserts no `bg-red-600`) |
| UI-024 | Document detail uses shared skeleton loading |
| UI-025 | Foundation unit tests present under `components/common` and `components/layout` |

### Intentional exceptions (unchanged)

- `skills/[id]/page.tsx` dirty-navigation `window.confirm` (navigation guard, not delete dialog) — tracked as residual a11y debt (UI-035) but not treated as ConfirmDialog delete bypass
- `ProjectDeleteDialog` / `EmbeddingModelChangeDialog` — complex multi-option `AlertDialog` content

---

## Issue table

| Order | Issue ID | Severity | Confidence | Effort | Component or Pattern | Locations | Scoring Categories | Recommended Action |
| ----- | -------- | -------- | ---------- | ------ | -------------------- | --------- | ------------------ | ------------------ |
| 1 | UI-026 | High | High | Large | Chat hook session/send residual | useProjectChat, useSourceChat | Duplication, Behavior, Composition | Extract shared session/send/enqueue core on existing helpers |
| 2 | UI-027 | High | High | Medium | List selection state twins | SourcesColumn, ArtifactsColumn | Duplication, Behavior | Extract `useListSelection` |
| 3 | UI-028 | Medium | High | Medium | Model picker markup/API drift | ModelSelector, ChatModelOverrideDialog, DefaultModelSelectors | Reuse, Duplication, Composition | Extend `ModelSelector` variants; reuse item renderer |
| 4 | UI-029 | Medium | High | Medium | Picker dialog scaffold | SkillPicker, ToolPicker, TemplatePicker | Duplication, Reuse | Extract `PickerDialogShell` + `EmptyState` |
| 5 | UI-030 | Medium | High | Small | Inline insight delete confirm | SourceInsightDialog | Reuse, A11y | Migrate to `ConfirmDialog` |
| 6 | UI-031 | Medium | High | Medium | Destructive color tokens | 12+ files using `text-red-*` / `bg-red-*` | Design-System | Standardize on `text-destructive` / destructive variants |
| 7 | UI-032 | Medium | High | Small | Page/load error panels | sources/page, LoginForm, ChatColumn | Reuse, Consistency | Shared `PageError` / Alert pattern |
| 8 | UI-033 | Low | High | Small | Labeled refresh controls | EpisodesTab, tools/[id] | Reuse, Duplication | Extend `PageRefreshButton` with label variant |
| 9 | UI-034 | High | High | Large | api-keys page monolith | settings/api-keys/page.tsx | Composition, Maintainability | Split dialogs/selectors into `components/settings/` |
| 10 | UI-035 | Medium | High | Small | Icon a11y + English aria | SourcesTableRow, ProfileCardActions, CollapsibleColumn, api-keys clears | A11y | Add aria-labels; i18n Expand/Collapse |
| 11 | UI-036 | Medium | High | Medium | Source detail manual fetch | SourceDetailContent | Behavior, Architecture | Prefer `useSource` / query hooks |
| 12 | UI-037 | Low | High | Small | Chat empty state | ChatPanelMessages | Reuse | Use `EmptyState` |

---

# UI-026: Residual chat session/send/enqueue duplication in project and source hooks

**Severity:** High
**Confidence:** High
**Estimated effort:** Large
**Dependencies:** Builds on existing `useChatQueue`, `createAgUiChatSseHandler`, `useChatStreamingBuffer`, `useChatSessionSelection` (UI-020)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Behavior, State, and Frontend Logic; Composition and Component API Quality

## Problem

UI-020 extracted shared SSE/queue/streaming/session-selection helpers, but `useProjectChat` (728 lines) and `useSourceChat` (518 lines) still reimplement nearly identical session CRUD, optimistic send, enqueue-with-auto-create, and skill/template persistence flows. Bug fixes and behavioral changes must be applied twice, and API naming already drifts (`isSending` vs `isStreaming`, queue `includeFailed` defaults, abort/edit capabilities).

## Current state

- Shared helpers used by both:
  - `frontend/src/lib/hooks/chat-sse-handlers.ts` — `createAgUiChatSseHandler`
  - `frontend/src/lib/hooks/useChatQueue.ts`
  - `frontend/src/lib/hooks/useChatStreamingBuffer.ts`
  - `frontend/src/lib/hooks/useChatSessionSelection.ts`
  - `frontend/src/lib/hooks/chat-queue-status.ts`
- Residual duplication evidence:
  - Session mutations + toast `onError` patterns in both hooks
  - Optimistic message + `createAgUiChatSseHandler` wiring (`useProjectChat` ~355; `useSourceChat` ~232)
  - `enqueueMessage` auto-create session flows (`useProjectChat` ~448; `useSourceChat` ~323)
  - `setSelectedSkillIds` / HTML template persistence (`useProjectChat` ~592; `useSourceChat` ~431)
- Meaningful differences that must remain configurable: project context building / shared guest mode vs source context indicators; project `editAndResend`; source `cancelStreaming` / abort controller

## Goal state

- A shared `useChatSessionRuntime` (or similar) owns session list/selection sync, create/update/delete mutations, send/enqueue orchestration, skill/template persistence, and streaming flags.
- Domain hooks become thin adapters supplying API clients, query keys, and context-building callbacks.
- Preserve project-only and source-only behaviors via injected options rather than boolean sprawl.
- Verify: both hooks shrink substantially; shared tests cover send/enqueue/session persistence; existing ChatPanel consumers keep working.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
After UI-020 extracted shared chat helpers, useProjectChat and useSourceChat still duplicate session CRUD, optimistic send, enqueue-with-auto-create, and skill/template persistence.

Files:
- frontend/src/lib/hooks/useProjectChat.ts (~728 lines)
- frontend/src/lib/hooks/useSourceChat.ts (~518 lines)
- Existing shared helpers to build on:
  - frontend/src/lib/hooks/chat-sse-handlers.ts
  - frontend/src/lib/hooks/useChatQueue.ts
  - frontend/src/lib/hooks/useChatStreamingBuffer.ts
  - frontend/src/lib/hooks/useChatSessionSelection.ts
  - frontend/src/lib/hooks/chat-queue-status.ts

Architecture:
- Extract a shared chat session/send runtime hook that accepts injected API adapters (project vs source), query keys, and optional feature callbacks.
- Prefer composition/options over many boolean props.
- Keep project-only behavior (context building, sharedMode/guestKey, editAndResend) and source-only behavior (contextIndicators, cancelStreaming/abort) in thin domain wrappers.
- Align public naming where safe (document any intentional isSending vs isStreaming differences if ChatPanel requires both).
- Preserve all existing UX, toasts, queue merging, and SSE behavior unless a bug fix is required.
- Add/extend unit tests for the shared runtime; keep or update ChatPanel/ChatColumn/queue tests.
- Run frontend typecheck, lint, and relevant vitest suites.
- Summarize files changed and verification completed.

Acceptance criteria:
- Duplicated session/send/enqueue/skill-persist blocks are centralized.
- useProjectChat and useSourceChat are primarily adapters.
- Project and source chat UIs still stream, enqueue, persist skills/templates, and handle errors.
```

---

# UI-027: Duplicated list-selection state in SourcesColumn and ArtifactsColumn

**Severity:** High
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (`ListSelectionBar` already shared)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Behavior, State, and Frontend Logic

## Problem

Both project columns reimplement identical selection state machines (`selectedIds` Set, `selectionMode`, `clearSelection`, `enterSelection`, `toggleSelect`, `selectAllVisible`) and wire them to the shared `ListSelectionBar`. Only the item id source and bulk actions differ. This is true duplication of frontend behavior that should live in one hook.

## Current state

- Shared UI already exists: `frontend/src/components/common/ListSelectionBar.tsx`
- Duplicated logic:
  - `frontend/src/app/(dashboard)/projects/components/SourcesColumn.tsx` ~94–119, bar usage ~542–550
  - `frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx` ~100–122, bar usage ~339–347
- Feature-specific bulk actions (retry/knowledge graph vs note context/delete) should remain in each column.

## Goal state

- `useListSelection<TId>(getVisibleIds)` returns selection state + handlers.
- Both columns consume the hook and keep domain bulk actions local.
- Verify selection enter/toggle/select-all/clear and bulk flows still work for sources and artifacts.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SourcesColumn and ArtifactsColumn duplicate the same Set-based multi-select state and handlers while already sharing ListSelectionBar.

Files:
- frontend/src/app/(dashboard)/projects/components/SourcesColumn.tsx (selection ~94–119)
- frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx (selection ~100–122)
- frontend/src/components/common/ListSelectionBar.tsx

Architecture:
- Extract useListSelection (or equivalent) under frontend/src/lib/hooks/.
- API should support enterSelection(id), toggleSelect(id), selectAllVisible(ids), clearSelection, selectedIds, selectionMode, selectedList.
- Migrate both columns to the hook; leave bulk action handlers feature-specific.
- Prefer a small focused hook over expanding ListSelectionBar with business logic.
- Add unit tests for the hook.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Selection helper logic exists once.
- Sources and artifacts selection UX unchanged.
- ListSelectionBar wiring remains.
```

---

# UI-028: Model selection markup and APIs drift across three implementations

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations; Composition and Component API Quality

## Problem

`ModelSelector` is the shared primitive for typed model picks, but settings defaults and chat override rebuild Select item markup and filtering independently. Responsibilities differ enough that forced merging into one mega-component would be harmful; the item renderer and type-filter Select core should still be shared.

## Current state

- Shared: `frontend/src/components/common/ModelSelector.tsx` (64 lines) — used by AdvancedModelsDialog, ArtifactPlayground, podcast profile forms
- Competing / parallel:
  - `frontend/src/components/source/ChatModelOverrideDialog.tsx` — language models + `default` sentinel + reset
  - `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` `DefaultModelSelectors` ~1092+ — grid of defaults + embedding-change confirm flow
- Duplicated SelectItem layout: name + provider muted span appears in all three

## Goal state

- Extract a small `ModelSelectItems` / extend `ModelSelector` with optional `allowDefault`, `models` injection, and `footer`/`onReset` composition points.
- `ChatModelOverrideDialog` and `DefaultModelSelectors` compose the shared selector rather than re-listing models.
- Keep embedding-change dialog and chat reset UX feature-specific.
- Verify settings defaults, chat override, search advanced models, and podcast forms still work.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Model select item markup and filtering are reimplemented in ModelSelector, ChatModelOverrideDialog, and DefaultModelSelectors inside api-keys/page.tsx.

Files:
- frontend/src/components/common/ModelSelector.tsx
- frontend/src/components/source/ChatModelOverrideDialog.tsx
- frontend/src/app/(dashboard)/settings/api-keys/page.tsx (DefaultModelSelectors)
- Consumers: AdvancedModelsDialog, ArtifactPlayground, podcast form dialogs

Architecture:
- Prefer extending ModelSelector / extracting a shared model-item renderer over creating a fourth competing component.
- Support composition for: optional "default" sentinel, injected model list, reset action, disabled/loading states.
- Do not collapse embedding-change confirmation or chat override dialog chrome into boolean soup.
- Migrate the three implementations to the shared core.
- Preserve accessibility (labels, trigger ids) and existing i18n.
- Add/adjust tests if present; smoke typecheck/lint.
- Summarize files changed and verification completed.

Acceptance criteria:
- Model option rendering/filtering lives in one place.
- Chat override default/reset behavior preserved.
- Settings default model grid + embedding change flow preserved.
```

---

# UI-029: Skill / Tool / Template picker dialogs duplicate shell and empty states

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (`EmptyState`, `PickerDialogSkeleton` exist)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Component Reuse

## Problem

Three picker dialogs share the same open/draft state pattern, Dialog header/body/footer chrome, loading skeleton, and plain-text empty message, while `ImageLibraryPicker` already shows the correct `EmptyState` pattern for the same class of UI.

## Current state

- `frontend/src/components/skills/SkillPicker.tsx` — empty plain `<p>` ~89–91
- `frontend/src/components/templates/TemplatePicker.tsx` — empty plain `<p>` ~77–79; raw `<input type="radio">` ~91–98
- `frontend/src/components/mcp/ToolPicker.tsx` — empty plain `<p>` ~122–124
- Good reference: `frontend/src/components/media/ImageLibraryPicker.tsx` ~48 uses `EmptyState`
- List body differences (checkbox skills, radio templates, grouped tools) should stay feature-specific

## Goal state

- Shared `PickerDialogShell` (trigger, title, loading, empty, footer slots/children).
- Empty states use `EmptyState` (compact variant if needed).
- Template radios use RadioGroup primitives when practical.
- Verify pickers still draft/cancel/save selections for chat composer consumers.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SkillPicker, ToolPicker, and TemplatePicker duplicate dialog scaffold, loading, and plain-text empty states. ImageLibraryPicker already uses EmptyState correctly.

Files:
- frontend/src/components/skills/SkillPicker.tsx
- frontend/src/components/mcp/ToolPicker.tsx
- frontend/src/components/templates/TemplatePicker.tsx
- Reference: frontend/src/components/media/ImageLibraryPicker.tsx
- Shared: frontend/src/components/common/EmptyState.tsx, LoadingSkeletons PickerDialogSkeleton

Architecture:
- Extract a PickerDialogShell with slots/children for list body and footer left content.
- Use EmptyState for empty lists.
- Keep selection models feature-specific (multi checkbox, single radio, grouped tools).
- Prefer RadioGroup for TemplatePicker radios if it preserves behavior.
- Avoid unrelated chat composer changes.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Shared shell used by the three pickers.
- Empty states use EmptyState.
- Selection save/cancel behavior unchanged.
```

---

# UI-030: SourceInsightDialog inline delete confirmation bypasses ConfirmDialog

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse; Accessibility and Responsive Consistency

## Problem

Insight delete inside `SourceInsightDialog` swaps the dialog body for a custom confirm panel instead of using the shared accessible `ConfirmDialog` already used for insight delete on the source detail page.

## Current state

- Bypass: `frontend/src/components/source/SourceInsightDialog.tsx` — `showDeleteConfirm` ~39; inline UI ~120–141
- Shared pattern already used nearby: `SourceDetailContent` insight delete via `ConfirmDialog` ~763–771

## Goal state

- `SourceInsightDialog` opens `ConfirmDialog` with destructive variant and loading state.
- Preserve delete mutation, toasts, and dialog close behavior.
- Verify keyboard focus/cancel/confirm parity with other deletes.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SourceInsightDialog implements an inline delete confirmation panel instead of ConfirmDialog.

Files:
- frontend/src/components/source/SourceInsightDialog.tsx (~39, ~120–141)
- Shared: frontend/src/components/common/ConfirmDialog.tsx
- Reference usage: frontend/src/components/source/SourceDetailContent.tsx insight ConfirmDialog

Requirements:
- Replace showDeleteConfirm body swap with ConfirmDialog (confirmVariant destructive, isLoading while deleting).
- Preserve i18n copy, mutation, and success/error handling.
- Do not alter unrelated insight display/ingest actions.
- Run relevant lint/typecheck/tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- No inline delete confirm panel remains in SourceInsightDialog.
- ConfirmDialog cancel/confirm works; loading disables actions.
```

---

# UI-031: Destructive and error colors bypass design tokens

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** UI-023 already fixed ConfirmDialog; extend the same convention
**Scoring categories affected:** Design-System and Styling Consistency

## Problem

After ConfirmDialog adopted destructive tokens, many menus, banners, and page errors still hard-code `text-red-600`, `text-red-500`, or `bg-red-600`, producing inconsistent destructive styling versus `text-destructive` / Button `destructive` variants.

## Current state (non-exhaustive, high-confidence sites)

- `frontend/src/app/(dashboard)/sources/page.tsx` ~245 — `text-red-500`
- `frontend/src/components/auth/LoginForm.tsx` ~93, ~162 — `text-red-600`
- `frontend/src/app/(dashboard)/projects/components/ProjectActionsMenu.tsx` ~69
- `frontend/src/app/(dashboard)/projects/components/ProjectHeader.tsx` ~135
- `frontend/src/app/(dashboard)/projects/components/SourcesColumn.tsx` ~609
- `frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx` ~377, ~814
- `frontend/src/app/(dashboard)/projects/components/ProjectDeleteDialog.tsx` ~163 — `bg-red-600`
- `frontend/src/components/sources/SourceCard.tsx` ~139, ~795
- `frontend/src/app/(dashboard)/skills/components/SkillFileTree.tsx` ~81
- `frontend/src/components/layout/SetupBanner.tsx` ~43
- `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` ~1386
- `frontend/src/components/common/ErrorBoundary.tsx` ~60
- Status colors (blue/green/amber for non-destructive states) and graph hex palettes are separate concerns — do not force those into destructive tokens

## Goal state

- Destructive actions and error text use `text-destructive`, `destructive` button/menu variants, or `Alert variant="destructive"`.
- Setup/error banners can share a small tokenized alert class if repeated.
- Verify dark mode contrast remains acceptable.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Many destructive/error UI surfaces still hard-code text-red-600/text-red-500/bg-red-600 after ConfirmDialog moved to destructive tokens.

Search frontend/src for text-red-500, text-red-600, bg-red-600 and migrate destructive/error usages to design tokens / destructive variants.

Do not invent a large new palette system. Do not recolor non-destructive status badges or knowledge-graph canvases unless they are clearly error/destructive.

Preserve behavior and i18n. Prefer existing Button/Alert/DropdownMenu destructive variants.
Run lint/typecheck on touched files.
Summarize files changed and verification completed.

Acceptance criteria:
- Destructive menus/buttons/errors use tokenized destructive styling.
- ConfirmDialog remains on destructive tokens.
- No unrelated visual redesign.
```

---

# UI-032: Inconsistent page/load error presentations

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Complements UI-031
**Scoring categories affected:** Shared Component Reuse; Design-System and Styling Consistency

## Problem

Failed-load and form error states reinvent markup instead of using shared Alert/`EmptyState`-adjacent patterns, so users see different error chrome for similar failures.

## Current state

- `frontend/src/app/(dashboard)/sources/page.tsx` ~242–247 — bare `<p className="text-red-500">`
- `frontend/src/components/auth/LoginForm.tsx` ~93, ~162 — custom red text blocks
- `frontend/src/app/(dashboard)/projects/components/ChatColumn.tsx` ~103–113 — custom Card + AlertCircle panel
- Better pattern: `frontend/src/app/(dashboard)/settings/components/SettingsForm.tsx` and podcast `TemplatesTab` use `Alert variant="destructive"`

## Goal state

- A small shared `PageError` / reuse of `Alert variant="destructive"` for page-level load failures and auth errors.
- Chat column can compose the same alert styling inside its Card if needed.
- Verify copy and retry affordances (where present) remain.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Page/load/auth error UIs are inconsistent across sources/page.tsx, LoginForm.tsx, and ChatColumn.tsx while SettingsForm/TemplatesTab already use Alert destructive.

Introduce a minimal shared pattern (prefer composing existing Alert) and migrate those call sites.
Do not build a heavy error-framework. Preserve i18n strings and any retry actions.
Run lint/typecheck.
Summarize files changed and verification completed.

Acceptance criteria:
- Sources load error, login errors, and chat column error use the shared alert pattern/tokens.
- No behavior regressions.
```

---

# UI-033: Labeled refresh buttons bypass PageRefreshButton

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Extends UI-015 `PageRefreshButton`
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations

## Problem

Most dashboard list pages use `PageRefreshButton`, but podcast episodes and tool detail rebuild labeled refresh buttons manually.

## Current state

- Shared: `frontend/src/components/layout/PageRefreshButton.tsx` (icon-only pattern used on projects/images/artifacts/tools/templates/skills/settings pages)
- Duplicates:
  - `frontend/src/components/podcasts/EpisodesTab.tsx` ~98–110 — outline Button + RefreshCcw + `common.refresh`
  - `frontend/src/app/(dashboard)/tools/[id]/page.tsx` ~198–206 — outline Button + RefreshCw + label
- Not issues: MCP sync and source retry RefreshCw actions (domain-specific, not page refresh)

## Goal state

- `PageRefreshButton` supports optional visible label / size variant.
- EpisodesTab and tools detail migrate to it.
- Verify disabled/fetching states and i18n label.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
EpisodesTab and tools/[id]/page implement labeled refresh buttons instead of PageRefreshButton.

Files:
- frontend/src/components/layout/PageRefreshButton.tsx (+ tests)
- frontend/src/components/podcasts/EpisodesTab.tsx (~98–110)
- frontend/src/app/(dashboard)/tools/[id]/page.tsx (~198–206)

Extend PageRefreshButton with an optional label/showLabel (and icon if needed) via composition-friendly props, migrate the two call sites, keep existing list-page icon-only usages unchanged.
Do not migrate sync/retry buttons.
Update PageRefreshButton tests.
Run lint/typecheck/tests.
Summarize files changed and verification completed.

Acceptance criteria:
- Labeled refresh uses PageRefreshButton.
- Existing icon-only refresh call sites unchanged visually.
```

---

# UI-034: settings/api-keys/page.tsx concentrates multiple reusable UI responsibilities

**Severity:** High
**Confidence:** High
**Estimated effort:** Large
**Dependencies:** Benefits from UI-028 if DefaultModelSelectors moves out
**Scoring categories affected:** Composition and Component API Quality

## Problem

The API keys route file is a 1433-line module containing credential CRUD UI, delete/migrate dialogs, provider cards, and `DefaultModelSelectors`. This blocks reuse, testing, and consistent composition with other settings components (`SettingsForm` is already properly extracted).

## Current state

- `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` — 1433 lines; inline `DeleteCredentialDialog`, `DefaultModelSelectors`, etc.
- Better contrast: `frontend/src/app/(dashboard)/settings/components/SettingsForm.tsx` (~277 lines) extracted under `components/settings/`
- Related: `frontend/src/components/settings/EmbeddingModelChangeDialog.tsx` already extracted

## Goal state

- Split into focused components under `frontend/src/components/settings/` (credential list/card, delete dialog, default model selectors, page orchestrator).
- Page file becomes composition-only.
- Preserve all credential/model behaviors and dialogs.
- Verify create/test/delete/register/migrate flows.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
frontend/src/app/(dashboard)/settings/api-keys/page.tsx is a 1433-line monolith embedding multiple dialogs and DefaultModelSelectors.

Architecture:
- Move cohesive UI units into frontend/src/components/settings/ following SettingsForm / EmbeddingModelChangeDialog patterns.
- Keep the route page as an orchestrator.
- Prefer composition over boolean props.
- Coordinate with ModelSelector reuse if UI-028 is in scope; otherwise extract DefaultModelSelectors as-is first.
- Preserve behavior, i18n, and destructive confirmations.
- Add tests for extracted pure/presentational pieces where practical.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- api-keys/page.tsx is primarily composition.
- No user-facing regressions in credentials/models settings.
```

---

# UI-035: Icon-only controls and CollapsibleColumn English aria strings

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Accessibility and Responsive Consistency

## Problem

Several icon-only buttons lack accessible names, and column collapse controls hard-code English "Expand"/"Collapse" in `aria-label` and visible text despite app-wide i18n.

## Current state

- Missing labels (examples):
  - `frontend/src/components/sources/SourcesTableRow.tsx` ~105–112 — delete icon button
  - `frontend/src/components/podcasts/ProfileCardActions.tsx` ~39–46 — MoreVertical trigger
  - `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` clear (`X`) icon buttons ~1237+, ~1289+
- English aria/copy:
  - `frontend/src/components/projects/CollapsibleColumn.tsx` ~42, ~54, ~83, ~89 — ``Expand ${...}`` / ``Collapse ${...}``
- Good references: AppSidebar (UI-022), GraphToolbar icon buttons with aria-labels, picker triggers

## Goal state

- Every icon-only Button has an `aria-label` (translated).
- CollapsibleColumn uses i18n keys for expand/collapse (new keys in en-US + locale sync per project practice).
- Verify screen-reader names and no visual regressions.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Icon-only buttons in SourcesTableRow, ProfileCardActions, and api-keys clear controls lack aria-labels. CollapsibleColumn hard-codes English Expand/Collapse in aria-label and visible text.

Fix:
- Add translated aria-labels to the icon-only controls listed above (search for other size="icon" without aria-label in the same files if present).
- Replace CollapsibleColumn Expand/Collapse strings with i18n keys; sync locales per repo practice.
- Do not change layout behavior.
- Run lint/typecheck; update AppSidebar/related tests if patterns overlap.
- Summarize files changed and verification completed.

Acceptance criteria:
- Icon-only controls expose accessible names.
- CollapsibleColumn expand/collapse is translated.
```

---

# UI-036: SourceDetailContent bypasses shared source query hooks

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (`useSource` already exists)
**Scoring categories affected:** Shared Behavior, State, and Frontend Logic

## Problem

The source detail page already uses `useSource(sourceId)`, while `SourceDetailContent` maintains parallel manual `useState` + `fetchSource` loading that bypasses TanStack Query caching/invalidation conventions used elsewhere.

## Current state

- Page: `frontend/src/app/(dashboard)/sources/[id]/page.tsx` calls `useSource`
- Content: `frontend/src/components/source/SourceDetailContent.tsx` ~82–128 — local `source`/`loading`/`fetchSource`
- Also embedded via source modal path — amplifies duplicate fetch logic
- Mutations in the same file toast with generic `common.error` rather than `getApiErrorMessage` in several places

## Goal state

- Detail content consumes query hooks (`useSource`, insights query/mutations) or receives query data via props without re-fetching the same resource.
- Cache invalidation aligns with `use-sources` patterns.
- Preserve modal and page embeddings.
- Verify loading skeletons, refresh-after-mutation, and error states.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SourceDetailContent manually fetches source/insights state even though useSource exists and the page already calls it.

Files:
- frontend/src/components/source/SourceDetailContent.tsx
- frontend/src/app/(dashboard)/sources/[id]/page.tsx
- frontend/src/lib/hooks/use-sources.ts (and related query keys)
- Modal consumer(s) of SourceDetailContent

Architecture:
- Prefer TanStack Query hooks for source detail/insights.
- Avoid duplicate network state; compose with existing mutation hooks where possible.
- Preserve all tabs/actions/delete ConfirmDialogs/toasts.
- Improve error toasts toward getApiErrorMessage if touching those paths.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- No parallel manual source fetch state for the primary detail resource.
- Page and modal detail views still function with correct cache updates.
```

---

# UI-037: ChatPanelMessages empty state bypasses EmptyState

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse

## Problem

The chat transcript empty prompt is a custom centered text block even though `EmptyState` is the app standard for empty surfaces (including SessionManager after UI-016).

## Current state

- `frontend/src/components/source/ChatPanelMessages.tsx` ~164–177 — custom `emptyState` div
- Shared: `frontend/src/components/common/EmptyState.tsx`
- Immersive vs compact spacing differences should remain configurable via className/size props

## Goal state

- Use `EmptyState` with chat icon + translated title; allow compact/immersive className overrides.
- Verify project and source chat empty copy still interpolates context type.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ChatPanelMessages renders a custom empty transcript block instead of EmptyState.

File:
- frontend/src/components/source/ChatPanelMessages.tsx (~164–177)
- Shared: frontend/src/components/common/EmptyState.tsx

Replace with EmptyState, preserving immersive/compact spacing and i18n startConversation copy.
Avoid unrelated ChatPanel refactors.
Run lint/typecheck.
Summarize files changed and verification completed.

Acceptance criteria:
- Empty transcript uses EmptyState.
- Project/source wording still correct.
```

---

## Final Assessment

### Recommended implementation order

1. **UI-027** `useListSelection` — small foundational win unblocking cleaner columns
2. **UI-030** SourceInsightDialog ConfirmDialog — quick consistency/a11y win
3. **UI-033** PageRefreshButton label variant — quick reuse win
4. **UI-037** Chat EmptyState — quick reuse win
5. **UI-035** Icon a11y + CollapsibleColumn i18n
6. **UI-032** Shared page/load error Alert pattern
7. **UI-031** Destructive token sweep
8. **UI-029** PickerDialogShell + EmptyState
9. **UI-028** ModelSelector extension / shared item renderer
10. **UI-036** SourceDetailContent query adoption
11. **UI-026** Shared chat session/send runtime (largest behavior risk — do after helpers are stable)
12. **UI-034** api-keys decomposition (parallelizable with UI-028)

### Shared components that should become frontend standards

- `EmptyState`, `ConfirmDialog`, `FieldError`, `PageHeader`, `PageRefreshButton`, `LoadingSkeletons`, `ListSelectionBar`, `ModelSelector` (extended), new `useListSelection`, new `PickerDialogShell`, existing podcast `ProfilePanelFrame` / `PodcastProfileFormDialogShell`, chat subcomponents under `components/source/Chat*`

### Existing components / patterns that should be deprecated after migration

- Inline picker empty `<p className="... text-muted-foreground">` blocks in Skill/Tool/Template pickers
- Inline insight delete confirm panel in `SourceInsightDialog`
- Duplicated column selection state machines once `useListSelection` lands
- Hard-coded `text-red-600` destructive menu classes where `destructive` variants exist
- Manual labeled refresh Button+RefreshCw pairs that match `PageRefreshButton` semantics

### Areas inspected and found consistent

- Dashboard page shell rhythm (`PageHeader`, `pageContentClassName`, `pageSectionGapClassName`)
- Primary list empty states using `EmptyState`
- Simple destructive deletes using `ConfirmDialog` (post UI-013)
- Route `loading.tsx` skeletons (`DashboardContentSkeleton`, `DetailPageSkeleton`)
- Project column chrome (`ColumnHeader`, `CollapsibleColumn`, `columnCardClassName`)
- Podcast profile CRUD framing after UI-018/UI-019
- Chat UI composition after UI-021
- UI primitive adoption for most forms (`Input`/`Select`/`Textarea`)
- Chat foundation tests for queue/SSE/session selection/streaming buffer

### Areas that could not be inspected deeply (coverage gaps)

- Every locale string file beyond key-parity spot checks
- Full visual/responsive matrix for share-route chat (`(share)/share/projects/...`)
- Exhaustive line-by-line review of `GeneratePodcastDialog.tsx` (~978) and knowledge-graph canvas internals (graph hex palette treated as intentional domain island)
- Runtime browser a11y audit (source-level aria review only)
- Storybook — none present

These gaps are reflected in the 87% coverage estimate and do not inflate category ratings.

### Categories preventing a higher score

- **Duplication / Shared Behavior:** residual chat-hook and selection duplication (UI-026, UI-027)
- **Composition:** monoliths (`api-keys`, `SourceCard`, columns) (UI-034)
- **Design-System:** destructive token drift (UI-031)
- **Testing:** missing Storybook and thin coverage of domain hooks/UI primitives

### Changes most likely to improve the score

1. Finish chat session/send consolidation (UI-026) and list selection hook (UI-027)
2. Extend ModelSelector + decompose api-keys (UI-028, UI-034)
3. Destructive token + error Alert standardization (UI-031, UI-032)
4. Picker shell + remaining ConfirmDialog/EmptyState bypasses (UI-029, UI-030, UI-037)
5. Broader component/hook tests beyond foundations

### Overall architecture assessment

The frontend has a clear shared-component foundation and improved measurably after UI-013–UI-025 (+8 to **72/100**). Primary list pages, confirms, field errors, page chrome, podcast frames, and chat UI composition now demonstrate intentional reuse. Remaining debt is concentrated in unfinished chat-domain consolidation, duplicated column selection behavior, a few picker/model selection parallels, destructive styling drift, and oversized settings/source surfaces. The architecture is **improving** and is ready for another remediation wave focused on behavior hooks before more visual prefabs.

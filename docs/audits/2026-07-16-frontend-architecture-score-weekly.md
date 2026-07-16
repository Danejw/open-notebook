# Frontend Architecture Score: 72/100

**Previous score:** 72/100 (2026-07-16 post-remediation audit in automation memory / commit `590b6dd`)
**Change:** 0
**Audit coverage:** 89% — High coverage
**Comparison status:** Directly comparable — same scoring rubric, similar High coverage (87% → 89%), prior open issues re-verified in current source, plus incremental inspection of list-row cards, nav a11y nesting, and rename dialogs
**Architecture trend:** Stable

**Issues found:** 14 open (High: 3, Medium: 9, Low: 2); 1 resolved since previous scored audit (UI-030)
**Most repeated frontend pattern:** Parallel project-column list-selection state + Skill/Template picker dialog scaffolds + residual chat-hook session/send/enqueue duplication
**Highest-value refactor:** Extract `useListSelection` for Sources/Artifacts columns, then finish a shared chat session/send core on the existing SSE/queue helpers

---

## Scorecard

| Scoring Category                                 |  Weight | Rating |   Points Earned | Evidence Summary |
| ------------------------------------------------ | ------: | -----: | --------------: | ---------------- |
| Shared Component Reuse                           |      25 |    4.2 |            21.0 | Foundations (`EmptyState`, `ConfirmDialog` ×21, `FieldError`, `PageHeader`, `PageRefreshButton`, `LoadingSkeletons`, `ListSelectionBar`, `ui/*`) remain widely adopted; UI-030 ConfirmDialog bypass removed with insights. Residual bypasses: ModelSelector, picker empties, labeled refresh buttons |
| Duplication and One-Off Implementations          |      20 |    3.5 |            14.0 | Same primary clusters as prior scorecard: chat hook session/send twins, column selection logic, Skill/Template/Tool picker scaffolds; newly confirmed rename-dialog triplicate and compact list-row twins |
| Composition and Component API Quality            |      15 |    3.3 |             9.9 | `ChatPanel` remains composed (~248 lines); monoliths persist (`api-keys/page.tsx` 1433, `SourceCard` 856, `ArtifactsColumn` 824, `useProjectChat` 831) |
| Design-System and Styling Consistency            |      15 |    3.5 |            10.5 | Tokenized `globals.css` + ui density conventions; `ConfirmDialog` uses destructive tokens; ~15 files still use hardcoded `text-red-*` / `bg-red-*` |
| Shared Behavior, State, and Frontend Logic       |      10 |    3.4 |             6.8 | Strong chat helper stack still shared; `useListSelection` still absent; `SourceDetailContent` still manual-fetches; residual hook send/enqueue duplication |
| Accessibility and Responsive Consistency         |      10 |    3.2 |             6.4 | Radix baseline + sidebar toggle labels remain; residual unlabeled icon buttons, English Expand/Collapse strings, skills `window.confirm`; newly confirmed `Link` wrapping `Button` in `AppSidebar` / `ProjectArtifactsNav` |
| Validation, Testing, and Component Documentation |       5 |    3.2 |             3.2 | Foundation unit tests still present for ConfirmDialog/EmptyState/FieldError/LoadingSkeletons/PageHeader/PageRefreshButton/button; no Storybook; chat domain hooks and most cards still untested |
| **Total**                                        | **100** |        |       **72/100** |                  |

### Category rating notes

1. **Shared Component Reuse (4.2):** Affirmative reuse on primary list pages, deletes, forms, and page chrome. UI-030 resolution removes one Medium ConfirmDialog bypass (SourceInsightDialog deleted with insights). Remaining Medium bypasses (ModelSelector, pickers, labeled refresh) keep this below 4.5. No unresolved High issue on a foundational shared *component* (High issues are behavior hooks / page monoliths).
2. **Duplication (3.5):** Unchanged primary clusters; TemplatePicker≈SkillPicker and Sources/Artifacts selection twins reconfirmed with line-level evidence. Not dominant app-wide, but systemic in those areas.
3. **Composition (3.3):** ChatPanel composition remains affirmative; feature monoliths unchanged in size class.
4. **Design-System (3.5):** Main token system applied; destructive red palette drift remains the primary repeated exception across ~15 files.
5. **Shared Behavior (3.4):** Shared chat infrastructure is real and used; unfinished domain-hook consolidation and missing `useListSelection` cap the rating.
6. **A11y/Responsive (3.2):** −0.1 vs prior 3.3 justified by newly confirmed foundational nav nesting (`Link` > `Button`) in `AppSidebar` and `ProjectArtifactsNav`, in addition to prior residual icon/English aria / `window.confirm` debt. Still within ±1.5 guardrail.
7. **Testing/Docs (3.2):** Foundation tests and CLAUDE.md docs remain affirmative; coverage of feature hooks and UI primitives remains partial. No Storybook.

### Historical comparison (category ratings)

| Category | Previous (post-remediation) | Current | Δ |
| -------- | --------------------------: | ------: | -: |
| Shared Component Reuse | 4.1 | 4.2 | +0.1 |
| Duplication and One-Off Implementations | 3.5 | 3.5 | 0 |
| Composition and Component API Quality | 3.3 | 3.3 | 0 |
| Design-System and Styling Consistency | 3.5 | 3.5 | 0 |
| Shared Behavior, State, and Frontend Logic | 3.4 | 3.4 | 0 |
| Accessibility and Responsive Consistency | 3.3 | 3.2 | −0.1 |
| Validation, Testing, and Component Documentation | 3.2 | 3.2 | 0 |
| **Total** | **72** | **72** | **0** |

Rating changes are within the ±1.5 guardrail and are explained by verified UI-030 resolution (insights removal) and newly confirmed AppSidebar interactive nesting evidence — not coverage inflation.

### Issues resolved since previous audit (verified in source)

| Issue | Verification |
| ----- | ------------ |
| UI-030 | `SourceInsightDialog` and all insight UI removed in `bfa42e1`; 0 references remain. ConfirmDialog bypass is moot. |

### Issues that remain from previous audit (re-verified)

UI-026, UI-027, UI-028, UI-029, UI-031, UI-032, UI-033, UI-034, UI-035, UI-036, UI-037 — all confirmed still present with current line evidence.

### New issues discovered this audit

UI-038 (nav Link+Button nesting / missing `aria-current`), UI-039 (compact list-row duplication), UI-040 (rename dialog triplicate).

### Intentional exceptions (unchanged)

- `skills/[id]/page.tsx` dirty-navigation `window.confirm` — tracked under UI-035 (not a ConfirmDialog delete bypass)
- `ProjectDeleteDialog` / `EmbeddingModelChangeDialog` — complex multi-option AlertDialog content (legitimate ConfirmDialog bypasses)
- `SourceCard` size/complexity — domain pipeline UI, not a generic card DRY target
- `GeneratePodcastDialog` context picker — intentionally unique hierarchical UX

---

## Audit coverage

**Inspected (meaningful source review):**
- Dashboard pages under `frontend/src/app/(dashboard)/` (projects, sources, artifacts, skills, tools, templates, images, documents, podcasts, search, settings, api-keys, advanced, graph)
- Shared foundations: `components/common/*`, `components/ui/*`, `components/layout/*`
- Feature components: source/chat, sources, podcasts (+ forms), projects columns, mcp, media, skills, templates, settings
- Hooks: chat stack (`useProjectChat`, `useSourceChat`, queue/SSE/session helpers), long-press, modal manager, data hooks
- Tests: 12 `*.test.tsx` under `frontend/src` plus hook unit tests
- Prior scorecard issues UI-026–UI-037 re-verified

**Not deeply inspected / limited:**
- Full `lib/a2ui` catalog renderer internals beyond surface chat integration
- Knowledge-graph Unity camera/control internals (empty-state presentation checked)
- Share-route UX beyond ChatPanel reuse confirmation
- Exhaustive per-locale translation completeness
- Visual/Storybook inventory (none present)

**Coverage estimate:** 89% of relevant frontend UI surface (pages + shared/feature components + shared hooks + foundation tests). Label: **High coverage**. Result is **not provisional**.

---

## Issue table

| Order | Issue ID | Severity | Confidence | Effort | Component or Pattern | Locations | Scoring Categories | Recommended Action |
| ----- | -------- | -------- | ---------- | ------ | -------------------- | --------- | ------------------ | ------------------ |
| 1 | UI-027 | High | High | Medium | List selection state twins | SourcesColumn, ArtifactsColumn | Duplication, Behavior | Extract `useListSelection` |
| 2 | UI-026 | High | High | Large | Chat hook session/send residual | useProjectChat, useSourceChat | Duplication, Behavior, Composition | Extract shared session/send/enqueue core |
| 3 | UI-034 | High | High | Large | api-keys page monolith | settings/api-keys/page.tsx | Composition | Split dialogs/selectors into `components/settings/` |
| 4 | UI-029 | Medium | High | Medium | Picker dialog scaffold | SkillPicker, TemplatePicker, ToolPicker | Duplication, Reuse | Extract `PickerDialogShell` + EmptyState |
| 5 | UI-028 | Medium | High | Medium | Model picker markup/API drift | ModelSelector, ChatModelOverrideDialog, DefaultModelSelectors | Reuse, Duplication, Composition | Extend `ModelSelector` variants |
| 6 | UI-040 | Medium | High | Medium | Rename/edit dialog triplicate | templates/page, images/page, documents/[id] | Duplication, Composition | Promote FormDialogShell from podcast shell |
| 7 | UI-039 | Medium | High | Medium | Compact list-row twins | ProjectCard, SkillCard, McpConnectionCard, templates rows | Duplication, Reuse, A11y | Extract `CompactListRow` with link slot |
| 8 | UI-038 | Medium | High | Small | Nav Link wrapping Button | AppSidebar, ProjectArtifactsNav | A11y | Use `Button asChild` + `aria-current` |
| 9 | UI-031 | Medium | High | Medium | Destructive color tokens | 15 files using `text-red-*` / `bg-red-*` | Design-System | Standardize on destructive tokens |
| 10 | UI-035 | Medium | High | Small | Icon a11y + English aria + window.confirm | SourcesTableRow, ProfileCardActions, CollapsibleColumn, api-keys, skills/[id] | A11y | Aria-labels, i18n Expand/Collapse, ConfirmDialog |
| 11 | UI-032 | Medium | High | Small | Page/load error panels | sources/page, LoginForm, ChatColumn | Reuse, Design-System | Shared `PageError` / Alert pattern |
| 12 | UI-036 | Medium | High | Medium | Source detail manual fetch | SourceDetailContent | Behavior | Prefer `useSource` query hook |
| 13 | UI-033 | Low | High | Small | Labeled refresh controls | EpisodesTab, tools/[id] | Reuse, Duplication | Extend `PageRefreshButton` label variant |
| 14 | UI-037 | Low | High | Small | Chat empty state | ChatPanelMessages | Reuse | Use `EmptyState` (or compact variant) |

---

# UI-027: Duplicated list-selection state in SourcesColumn and ArtifactsColumn

**Severity:** High
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (`ListSelectionBar` and `useLongPress` already shared)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Behavior, State, and Frontend Logic

## Problem

Both project columns reimplement identical Set-based multi-select state machines and wire them to the shared `ListSelectionBar`. Only the visible-id source and bulk actions differ. This is true behavioral duplication that should live in one hook. `useListSelection` still does not exist.

## Current state

- Shared UI: `frontend/src/components/common/ListSelectionBar.tsx`
- Shared long-press: `frontend/src/lib/hooks/use-long-press.ts`
- Duplicated logic:
  - `frontend/src/app/(dashboard)/projects/components/SourcesColumn.tsx` lines 92–117 (`selectedIds`, `selectionMode`, `clearSelection`, `enterSelection`, `toggleSelect`, `selectAllVisible`); bar at 525–533; bulk delete 317–331
  - `frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx` lines 100–122 (same shape); bar at 339–347; bulk delete 177–190
- Feature-specific differences to preserve: Sources bulk retry/KG/remove-from-project; Artifacts context include/exclude; Sources uses `sources.selectedCount`, Artifacts uses `common.selectedItems`
- No other manage pages implement this long-press bulk selection pattern (Templates/Images/Tools remain single-action — intentional)

## Goal state

- `useListSelection(visibleIds)` under `frontend/src/lib/hooks/` returns `{ selectedIds, selectionMode, selectedList, clearSelection, enterSelection, toggleSelect, selectAllVisible, isSelected }`
- Both columns consume the hook; domain bulk actions stay local
- Optional follow-up: unify count i18n key
- Verify: enter/toggle/select-all/clear + bulk flows for sources and artifacts

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SourcesColumn and ArtifactsColumn duplicate the same Set-based multi-select state and handlers while already sharing ListSelectionBar. useListSelection does not exist.

Files:
- frontend/src/app/(dashboard)/projects/components/SourcesColumn.tsx (selection ~92–117, bar ~525–533)
- frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx (selection ~100–122, bar ~339–347)
- frontend/src/components/common/ListSelectionBar.tsx
- frontend/src/lib/hooks/use-long-press.ts (keep; do not merge into selection hook)

Architecture:
- Extract useListSelection under frontend/src/lib/hooks/.
- Support enterSelection(id), toggleSelect(id), selectAllVisible(ids), clearSelection, selectedIds, selectionMode, selectedList, isSelected.
- Migrate both columns; leave bulk action handlers feature-specific.
- Prefer a small focused hook over expanding ListSelectionBar with business logic.
- Add unit tests for the hook.
- Preserve accessibility (selectionMode aria-pressed wiring on rows) and responsive sticky toolbar behavior.
- Run frontend typecheck, lint, and relevant vitest suites.
- Summarize files changed and verification completed.

Acceptance criteria:
- Selection helper logic exists once.
- Sources and artifacts selection UX unchanged (including Sources-only bulk remove).
- ListSelectionBar wiring remains.
```

---

# UI-026: Residual chat session/send/enqueue duplication in project and source hooks

**Severity:** High
**Confidence:** High
**Estimated effort:** Large
**Dependencies:** Builds on existing `useChatQueue`, `createAgUiChatSseHandler`, `useChatStreamingBuffer`, `useChatSessionSelection` (prior UI-020)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Behavior, State, and Frontend Logic; Composition and Component API Quality

## Problem

Shared SSE/queue/streaming/session-selection helpers are in place, but `useProjectChat` (831 lines) and `useSourceChat` (518 lines) still reimplement nearly identical session CRUD, optimistic send, enqueue-with-auto-create, and skill/template persistence. Behavioral drift already exists (`isSending` vs `isStreaming`, `queueHasWork` `includeFailed` default, abort/edit capabilities, model override APIs).

## Current state

- Shared helpers used by both:
  - `frontend/src/lib/hooks/chat-sse-handlers.ts`
  - `frontend/src/lib/hooks/useChatQueue.ts`
  - `frontend/src/lib/hooks/useChatStreamingBuffer.ts`
  - `frontend/src/lib/hooks/useChatSessionSelection.ts`
  - `frontend/src/lib/hooks/chat-queue-status.ts`
- Residual duplication evidence (current lines):
  - Session mutation toast/`onError` patterns: `useProjectChat` ~195–234; `useSourceChat` ~130–162
  - Pending skill/template restore effect: project ~149–175; source ~99–119
  - `sendMessage` optimistic + SSE wiring: project ~294–420; source ~174–292
  - `enqueueMessage` auto-create: project ~512–590; source ~323–387
  - Skill/template setters: project ~653–729; source ~431–473
  - Queue presentation wiring: project ~593–600 (`includeFailed: true`); source ~390–397 (failed excluded)
- UI shell already shared: `ChatPanel` + `SessionManager` + `ChatQueuePanel`
- Differences that must remain configurable: project context/`sharedMode`/editAndResend; source abort/`cancelStreaming`/context indicators

## Goal state

- Shared runtime owns session mutations, send/enqueue orchestration, pending selection persistence, default session title helper, and consistent queue presentation options
- Domain hooks become thin adapters (API + query keys + feature callbacks)
- Normalize public flags where ChatPanel consumers allow; document intentional differences
- Verify both chat surfaces stream, enqueue, persist skills/templates, and handle errors

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
useProjectChat (~831 lines) and useSourceChat (~518 lines) still duplicate session CRUD, optimistic send, enqueue-with-auto-create, and skill/template persistence after shared SSE/queue helpers were extracted.

Files:
- frontend/src/lib/hooks/useProjectChat.ts
- frontend/src/lib/hooks/useSourceChat.ts
- Existing shared helpers to extend:
  - frontend/src/lib/hooks/chat-sse-handlers.ts
  - frontend/src/lib/hooks/useChatQueue.ts
  - frontend/src/lib/hooks/useChatStreamingBuffer.ts
  - frontend/src/lib/hooks/useChatSessionSelection.ts
  - frontend/src/lib/hooks/chat-queue-status.ts
- Consumers: ChatColumn, sources/[id]/page.tsx, ChatPanel

Architecture:
- Extract a shared chat session/send runtime that accepts injected API adapters, query keys, and optional feature callbacks.
- Prefer composition/options over boolean sprawl.
- Keep project-only and source-only behaviors in thin wrappers.
- Align queueHasWork includeFailed semantics unless intentionally divergent (document if so).
- Extract deriveDefaultSessionTitle (currently copied 4×).
- Preserve all existing UX/toasts/SSE/queue merge behavior.
- Add/extend unit tests; keep ChatPanel/queue tests green.
- Run typecheck, lint, relevant vitest.
- Summarize files changed and verification completed.

Acceptance criteria:
- Duplicated session/send/enqueue/skill-persist blocks are centralized.
- Domain hooks are primarily adapters.
- Project and source chat UIs still stream, enqueue, persist selections, and handle errors.
```

---

# UI-034: settings/api-keys/page.tsx concentrates multiple reusable UI responsibilities

**Severity:** High
**Confidence:** High
**Estimated effort:** Large
**Dependencies:** UI-028 (DefaultModelSelectors should reuse ModelSelector during/after split)
**Scoring categories affected:** Composition and Component API Quality

## Problem

A single 1,433-line page module owns credential CRUD dialogs, model discovery/registration, delete/migrate flows, provider section cards, and default model assignment. Multiple reusable UI responsibilities are embedded as private functions, making reuse and testing difficult and encouraging further one-offs (custom model Selects, unlabeled clear buttons).

## Current state

- `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` — 1433 lines
- Inline components still in-file:
  - `CredentialFormDialog` (~159–417)
  - `DiscoverModelsDialog` (~418–664)
  - `DeleteCredentialDialog` (~670–772)
  - `CredentialItem` (~773–991)
  - `ProviderSection` (~992–1091)
  - `DefaultModelSelectors` (~1092+)
- Positive: uses `SettingsFormSkeleton` / `ListRowsSkeleton` / `InlineSkeleton`
- Gaps: no `PageRefreshButton`; hardcoded encryption `Alert` red classes (~1385–1389); clear `X` buttons lack aria-labels (~1237–1239)

## Goal state

- Split into `frontend/src/components/settings/` modules with clear single responsibilities
- Page becomes composition of sections + data hooks
- Default model UI migrates toward extended `ModelSelector` (UI-028)
- Preserve encryption gating, discovery, migration, and destructive flows

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
settings/api-keys/page.tsx is a 1433-line monolith with six inline UI components spanning credentials, discovery, delete/migrate, and default model assignment.

Files:
- frontend/src/app/(dashboard)/settings/api-keys/page.tsx
- frontend/src/components/settings/ (existing EmbeddingModelChangeDialog, MigrationBanner, ModelTestResultDialog)
- frontend/src/components/common/ModelSelector.tsx (coordinate with UI-028 if touching defaults)

Architecture:
- Extract CredentialFormDialog, DiscoverModelsDialog, DeleteCredentialDialog, CredentialItem, ProviderSection, DefaultModelSelectors into components/settings/.
- Keep page as layout/data orchestration only.
- Prefer composition; avoid a mega-props settings context unless necessary.
- Preserve all existing behavior, validation, encryption gating, and dialogs.
- Add aria-labels to icon-only clear/delete controls while splitting.
- Add focused tests for extracted pure/dialog helpers where practical.
- Run typecheck, lint, relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- page.tsx is primarily composition.
- No behavior regressions in credentials/models/defaults flows.
- Extracted components live under components/settings/.
```

---

# UI-029: Skill / Template / Tool picker dialogs duplicate shell and empty states

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (`PickerDialogSkeleton` already shared)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Component Reuse

## Problem

`TemplatePicker` and `SkillPicker` are near-clones (icon trigger, draft-on-open, identical DialogContent/header/body/footer chrome). `ToolPicker` shares the draft/save pattern with divergent chrome. Empty lists use ad-hoc `<p>` instead of `EmptyState`. No `PickerDialogShell` exists.

## Current state

- `frontend/src/components/templates/TemplatePicker.tsx` — shell classes line 68; empty 77–79; footer 114–139
- `frontend/src/components/skills/SkillPicker.tsx` — shell classes line 80; empty 89–91; footer 126–139
- `frontend/src/components/mcp/ToolPicker.tsx` — similar draft/save; chrome differs (`sm:max-w-md`, no `p-0`)
- Shared loading only: `PickerDialogSkeleton` in `LoadingSkeletons.tsx` ~77–90
- Selection UX differences to preserve: Template radio single-select; Skill/Tool checkbox multi-select

## Goal state

- `PickerDialogShell` with slots: trigger, title, children, footerLeft?, onOpen reset helpers
- Empty states use `EmptyState` or a compact picker empty variant
- Feature pickers supply list item renderers only
- ToolPicker optionally migrates for visual consistency

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
TemplatePicker and SkillPicker duplicate dialog chrome, draft-on-open, and empty-state markup. ToolPicker is a close cousin. PickerDialogShell does not exist.

Files:
- frontend/src/components/templates/TemplatePicker.tsx
- frontend/src/components/skills/SkillPicker.tsx
- frontend/src/components/mcp/ToolPicker.tsx
- frontend/src/components/common/LoadingSkeletons.tsx (PickerDialogSkeleton)
- frontend/src/components/common/EmptyState.tsx

Architecture:
- Extract PickerDialogShell (common/) with composition slots (trigger, title, body, footerLeft, actions).
- Migrate TemplatePicker and SkillPicker first; ToolPicker if chrome can align without UX regression.
- Replace ad-hoc empty <p> with EmptyState or a compact variant.
- Keep selection mode feature-specific (radio vs checkbox).
- Preserve aria-labels on icon triggers and save/cancel behavior.
- Add a small unit test for the shell open/reset/save wiring if practical.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Dialog chrome exists once for migrated pickers.
- Selection UX and i18n strings preserved.
- Loading still uses PickerDialogSkeleton.
```

---

# UI-028: Model selection markup and APIs drift across three implementations

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Helps UI-034 DefaultModelSelectors extraction
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations; Composition and Component API Quality

## Problem

Canonical `ModelSelector` filters by type and renders name+provider items, but chat override and settings defaults reimplement the same SelectItem markup with extra capabilities (default sentinel, clear, required invalid styling, compact height) that were never added to the shared component.

## Current state

- Shared: `frontend/src/components/common/ModelSelector.tsx` lines 8–64
- Proper consumers: AdvancedModelsDialog, podcast profile forms, ArtifactPlayground
- Bypass #1: `frontend/src/components/source/ChatModelOverrideDialog.tsx` lines 104–136 — language filter + default option + name/provider rows
- Bypass #2: `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` `DefaultModelSelectors` lines 1211–1235 and mirrored advanced grid — sort, required border, clear `X`
- DiscoverModelsDialog checkbox multi-select is a different UX (not a ModelSelector candidate)

## Goal state

- Extend `ModelSelector` with intentional variants: `allowDefault`/`defaultLabel`, `allowClear`, `required`/`invalid`, `size: 'default' | 'compact'`, optional sort
- Or extract shared `ModelSelectItems` renderer used by dialog wrappers
- Migrate ChatModelOverrideDialog and DefaultModelSelectors
- Preserve embedding-change confirmation side effect in settings

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ModelSelector exists but ChatModelOverrideDialog and DefaultModelSelectors reimplement filtered model SelectItem markup with extra capabilities.

Files:
- frontend/src/components/common/ModelSelector.tsx
- frontend/src/components/source/ChatModelOverrideDialog.tsx
- frontend/src/app/(dashboard)/settings/api-keys/page.tsx (DefaultModelSelectors ~1092+)
- Existing good consumers (do not regress): AdvancedModelsDialog, Episode/Speaker profile forms, ArtifactPlayground

Architecture:
- Extend ModelSelector (or extract ModelSelectItems) with allowDefault, allowClear, required/invalid styling, compact size — prefer composition over boolean explosion where slots help.
- Migrate ChatModelOverrideDialog and DefaultModelSelectors to the shared primitive.
- Keep EmbeddingModelChangeDialog flow for embedding default changes.
- Preserve loading skeletons (SelectMenuSkeleton) and i18n.
- Add/extend tests for new ModelSelector variants.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Name+provider model lists render from one shared implementation.
- Chat override default/reset and settings required/clear behaviors preserved.
```

---

# UI-040: Rename/edit dialogs triplicate create-edit form chrome

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Can promote patterns from `PodcastProfileFormDialogShell`
**Scoring categories affected:** Duplication and One-Off Implementations; Composition and Component API Quality

## Problem

Templates, images, and document detail each implement nearly the same controlled Dialog + DialogHeader + single-field form + cancel/save footer for rename/edit. Podcast domain already extracted `PodcastProfileFormDialogShell`, but that shell was never generalized for app-wide form dialogs.

## Current state

- `frontend/src/components/podcasts/forms/PodcastProfileFormDialogShell.tsx` — domain shell with open-reset, beforeForm slot, footer-in-form
- Near-duplicate rename/edit dialogs:
  - `frontend/src/app/(dashboard)/templates/page.tsx` (~177–224)
  - `frontend/src/app/(dashboard)/images/page.tsx` (~204–253)
  - `frontend/src/app/(dashboard)/documents/[id]/page.tsx` (~480–511)
- Related: `CreateProjectDialog` already uses `dialogBodyClassName` tokens; pickers/forms inconsistently adopt dialog class helpers from `ui/dialog.tsx`

## Goal state

- Domain-agnostic `FormDialogShell` in `components/common/` (promote from podcast shell)
- Rename/edit dialogs become thin field+submit compositions
- Podcast forms can optionally migrate to the common shell or wrap it
- Preserve validation, disabled states, and i18n labels

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
templates/page, images/page, and documents/[id] each rebuild Dialog+header+form+footer rename chrome. PodcastProfileFormDialogShell already solved this for podcasts only.

Files:
- frontend/src/components/podcasts/forms/PodcastProfileFormDialogShell.tsx
- frontend/src/app/(dashboard)/templates/page.tsx (rename dialog)
- frontend/src/app/(dashboard)/images/page.tsx (edit dialog)
- frontend/src/app/(dashboard)/documents/[id]/page.tsx (rename/save dialogs)
- frontend/src/components/ui/dialog.tsx (dialogBodyClassName / footer tokens)

Architecture:
- Promote a FormDialogShell to components/common/ with children/slots for fields, open-reset callback, and footer actions inside <form>.
- Migrate the three rename/edit dialogs.
- Prefer wrapping rather than breaking podcast forms in the same PR unless low-risk.
- Reuse dialog class tokens; preserve accessibility (titles, labels, submit via Enter).
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Rename/edit chrome is shared.
- Existing save/cancel/validation behavior preserved.
- No unrelated dialog refactors.
```

---

# UI-039: Compact list-row cards duplicated across manage pages

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Component Reuse; Accessibility and Responsive Consistency

## Problem

Project, skill, MCP connection, and template manage lists independently rebuild the same compact row shell (`flex items-center gap-2 px-3 py-1.5`, icon, truncated title, meta, actions, `hover:bg-muted/40`). Keyboard/link a11y is inconsistent: `SkillCard` uses `Link`; `ProjectCard`/`ProjectRow` use clickable `div` without role/tabIndex; `SourceCard` already demonstrates the accessible interactive-row pattern.

## Current state

- `frontend/src/app/(dashboard)/projects/components/ProjectCard.tsx` lines 22–39 — clickable `div` + router.push
- `frontend/src/app/(dashboard)/skills/components/SkillCard.tsx` lines 30–55 — semantic `Link`
- `frontend/src/app/(dashboard)/tools/components/McpConnectionCard.tsx` lines 45–119 — Link + action icons
- `frontend/src/app/(dashboard)/templates/page.tsx` lines 121–157 — inline row (no extracted card)
- Accessibility reference (do not over-abstract): `frontend/src/components/sources/SourceCard.tsx` ~533–566 (`role="button"`, tabIndex, keyboard handlers)
- Podcast `EpisodeCard` uses shadcn Card blocks — intentionally different visual system; leave alone

## Goal state

- `CompactListRow` with slots: leading icon, title, meta, actions, and `asChild`/href navigation
- Migrate ProjectCard, SkillCard, McpConnectionCard, templates rows
- Default keyboard focus + semantic link/button behavior
- Keep domain actions feature-specific

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Multiple manage-list cards rebuild the same compact row layout with inconsistent navigation a11y (div onClick vs Link).

Files:
- frontend/src/app/(dashboard)/projects/components/ProjectCard.tsx
- frontend/src/app/(dashboard)/projects/components/ProjectRow.tsx
- frontend/src/app/(dashboard)/skills/components/SkillCard.tsx
- frontend/src/app/(dashboard)/tools/components/McpConnectionCard.tsx
- frontend/src/app/(dashboard)/templates/page.tsx (inline rows)
- Reference a11y: frontend/src/components/sources/SourceCard.tsx (do not force SourceCard into this abstraction)

Architecture:
- Extract CompactListRow under components/common/ with composition slots and link/button navigation.
- Prefer asChild/Link composition over onClick divs.
- Migrate the listed consumers; leave EpisodeCard/SourceCard/ArtifactCard as domain-specific.
- Preserve hover density classes and listActionTriggerClassName usage for actions.
- Add a focused a11y/unit test for keyboard/link behavior.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Shared row primitive used by migrated lists.
- Rows are keyboard-accessible and have clear accessible names.
- Visual density remains consistent with current manage pages.
```

---

# UI-038: AppSidebar / ProjectArtifactsNav nest Link around Button and omit aria-current

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None (orthogonal to UI-035 icon labels)
**Scoring categories affected:** Accessibility and Responsive Consistency

## Problem

Primary navigation builds a `Button`, then wraps it in `Link`, creating nested interactive elements. Active routes are styled but not exposed via `aria-current="page"`. This is foundational shared chrome, so inconsistent a11y here affects every authenticated page.

## Current state

- `frontend/src/components/layout/AppSidebar.tsx` lines 122–164 — `button` JSX wrapped by `Link` (collapsed tooltip path 146–153; expanded 161–163); active detection at 123 without `aria-current`
- `frontend/src/components/projects/ProjectArtifactsNav.tsx` — same Link>Button pattern (~28–76) without `aria-current`
- Positive: collapse toggles already have i18n `aria-label`s (prior UI-022); tests cover toggle labels in `AppSidebar.test.tsx`

## Goal state

- Use `Button asChild` with `Link` child (single interactive element) or styled Link matching button variants
- Set `aria-current="page"` when active
- Update AppSidebar tests to cover active/current semantics and forbid nested interactive content

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
AppSidebar and ProjectArtifactsNav wrap Button inside Link (nested interactives) and do not set aria-current on the active route.

Files:
- frontend/src/components/layout/AppSidebar.tsx (~122–164)
- frontend/src/components/projects/ProjectArtifactsNav.tsx
- frontend/src/components/layout/AppSidebar.test.tsx

Architecture:
- Refactor nav items to a single interactive element (Button asChild > Link, or Link with buttonVariants).
- Add aria-current="page" when pathname matches.
- Preserve prefetch-on-hover, collapsed tooltips, and visual active styles.
- Extend tests for aria-current and ensure no button nested inside link.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- No nested interactive elements in sidebar/project nav.
- Active route announced via aria-current.
- Visual behavior unchanged.
```

---

# UI-031: Destructive and error colors bypass design tokens

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Extends prior ConfirmDialog token fix (UI-023)
**Scoring categories affected:** Design-System and Styling Consistency

## Problem

Despite `text-destructive` / destructive button variants existing and ConfirmDialog using them, ~15 production files still hardcode `text-red-*` / `bg-red-*` / `border-red-*` for errors, destructive actions, and warning banners. Similar elements therefore look and thematically behave inconsistently (especially dark mode).

## Current state

Top offenders (current counts):
- `frontend/src/components/podcasts/EpisodeCard.tsx` (status + error panel ~55–404)
- `frontend/src/components/layout/SetupBanner.tsx` (~42–53)
- `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` encryption alert (~1385–1389)
- `frontend/src/components/common/ErrorBoundary.tsx` (~59–62)
- `frontend/src/components/auth/LoginForm.tsx` (~93, ~162)
- Also: ArtifactsColumn, SourcesColumn, ProjectDeleteDialog (`bg-red-600` ~163), ProjectActionsMenu, ProjectHeader, SkillFileTree, SourceCard, sources/page, RebuildEmbeddings
- Counter-evidence: ~119 `text-destructive`/`destructive` usages exist — the system is available but unevenly applied

## Goal state

- Standardize destructive/error styling on design tokens (`text-destructive`, `bg-destructive`, `border-destructive`, Alert variants)
- Allow intentional status-color maps only when documented (e.g., episode status chips) and preferably tokenized
- ProjectDeleteDialog confirm button uses `variant="destructive"` like ConfirmDialog

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Many components hardcode text-red-*/bg-red-* instead of destructive design tokens already used by ConfirmDialog and elsewhere.

Files (non-exhaustive; search frontend/src for text-red-|bg-red-|border-red-):
- EpisodeCard, SetupBanner, api-keys/page, ErrorBoundary, LoginForm, ArtifactsColumn, SourcesColumn, ProjectDeleteDialog, ProjectActionsMenu, ProjectHeader, SkillFileTree, SourceCard, sources/page, RebuildEmbeddings

Architecture:
- Replace hardcoded red utility classes with text-destructive / border-destructive / bg-destructive (and dark-mode-safe token pairs) or shared Alert variants.
- Keep ConfirmDialog patterns as the reference for destructive actions.
- Do not change non-destructive brand colors.
- Prefer minimal visual delta; verify dark mode.
- Run typecheck/lint; smoke key screens if possible.
- Summarize files changed and verification completed.

Acceptance criteria:
- No unnecessary hardcoded red utilities remain for destructive/error UI.
- Destructive actions remain clearly styled and accessible.
```

---

# UI-035: Residual icon a11y, English aria strings, and skills dirty-navigation confirm

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** ConfirmDialog already available for skills dirty nav
**Scoring categories affected:** Accessibility and Responsive Consistency

## Problem

Several shared/feature controls still ship unlabeled icon buttons or hardcoded English Expand/Collapse aria/tooltips. Skills file switching still uses `window.confirm`, which is inaccessible and inconsistent with the app’s ConfirmDialog standard.

## Current state

- `frontend/src/components/sources/SourcesTableRow.tsx` ~102–109 — icon-only delete Button without aria-label
- `frontend/src/components/podcasts/ProfileCardActions.tsx` ~39–46 — MoreVertical trigger unlabeled
- `frontend/src/components/projects/CollapsibleColumn.tsx` lines 42, 54, 83, 89 — hardcoded `Expand ${…}` / `Collapse ${…}`
- `frontend/src/app/(dashboard)/settings/api-keys/page.tsx` ~1237–1239, ~1289–1291 — clear `X` buttons lack aria-label
- `frontend/src/app/(dashboard)/skills/[id]/page.tsx` line 131 — `window.confirm(t('skills.unsavedWarning'))`
- beforeunload handler at 118–126 is acceptable native browser behavior (leave)

## Goal state

- All icon-only buttons have i18n aria-labels (and titles where helpful)
- CollapsibleColumn uses translation keys for Expand/Collapse
- Skills dirty navigation uses ConfirmDialog (or shared UnsavedChangesDialog) while preserving cancel/stay behavior

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Residual unlabeled icon buttons, English Expand/Collapse aria strings, and skills dirty-nav window.confirm remain after earlier a11y remediation.

Files:
- frontend/src/components/sources/SourcesTableRow.tsx
- frontend/src/components/podcasts/ProfileCardActions.tsx
- frontend/src/components/projects/CollapsibleColumn.tsx
- frontend/src/app/(dashboard)/settings/api-keys/page.tsx (clear X buttons)
- frontend/src/app/(dashboard)/skills/[id]/page.tsx (~131)
- frontend/src/components/common/ConfirmDialog.tsx
- Locale files under frontend/src/lib/locales/ (add keys; do not rename unrelated keys)

Architecture:
- Add aria-label (i18n) to icon-only controls listed above.
- Replace CollapsibleColumn English strings with translation keys.
- Replace skills window.confirm with ConfirmDialog-based unsaved changes flow; keep beforeunload as-is.
- Preserve existing behavior and copy.
- Extend/add tests where practical (ConfirmDialog already tested).
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- No window.confirm in skills file navigation.
- Icon-only controls expose accessible names.
- Expand/Collapse strings are translated.
```

---

# UI-032: Inconsistent page/load error presentations

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Complements UI-031 token cleanup
**Scoring categories affected:** Shared Component Reuse; Design-System and Styling Consistency

## Problem

Load/error failures are presented with three different ad-hoc UIs. There is no shared `PageError` (or equivalent) component, so users see inconsistent hierarchy, icons, and destructive styling for the same class of failure.

## Current state

- No `PageError` component exists
- `frontend/src/app/(dashboard)/sources/page.tsx` ~242–247 — centered `<p className="text-red-500">`
- `frontend/src/components/auth/LoginForm.tsx` ~81–125 — Card + AlertCircle + `text-red-600`
- `frontend/src/app/(dashboard)/projects/components/ChatColumn.tsx` ~110–120 — Card + icon + muted text (not destructive)
- Related empty inconsistency: sources empty state omits `PageHeader` while loading/populated branches include it (~250–257)

## Goal state

- Shared `PageError` (or `InlineError`) built on Alert/EmptyState conventions with title, description, optional retry action
- Migrate the three call sites; keep LoginForm branding within the shared structure if needed via slots
- Align destructive tokens with UI-031

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
sources/page, LoginForm, and ChatColumn each implement different load/error presentations. No shared PageError exists.

Files:
- frontend/src/app/(dashboard)/sources/page.tsx (~242–247; also review empty branch ~250–257 PageHeader omission)
- frontend/src/components/auth/LoginForm.tsx (~81–125)
- frontend/src/app/(dashboard)/projects/components/ChatColumn.tsx (~110–120)
- frontend/src/components/ui/alert.tsx / frontend/src/components/common/EmptyState.tsx (reuse)

Architecture:
- Create a small shared PageError/InlineError in components/common with title, description, optional action, and tokenized destructive styling.
- Migrate the three call sites without forcing unrelated error UIs (toasts stay toasts).
- Prefer composition slots over many booleans.
- Optionally keep PageHeader visible on sources empty/error for layout consistency.
- Add a unit test for the shared component.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Shared error presentation used by migrated sites.
- Messaging and retry/login actions preserved.
```

---

# UI-036: SourceDetailContent manual fetch bypasses useSource

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (`useSource` already exists)
**Scoring categories affected:** Shared Behavior, State, and Frontend Logic

## Problem

`SourceDetailContent` manually loads a source with `useState` + `sourcesApi.get()` in an effect, bypassing the existing TanStack Query `useSource` hook. This duplicates loading/error/cache behavior and risks stale data when other mutations invalidate `['sources']` queries.

## Current state

- Manual fetch: `frontend/src/components/source/SourceDetailContent.tsx` ~66–100 (`sourcesApi.get(sourceId)`)
- Existing hook: `frontend/src/lib/hooks/use-sources.ts` — `useSource` (~142–149)
- Detail UI otherwise uses shared ConfirmDialog/skeletons from prior remediations

## Goal state

- SourceDetailContent uses `useSource(sourceId)` (or equivalent query) for data/loading/error
- Mutations invalidate the same query keys
- Preserve current detail UX and actions

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SourceDetailContent manually fetches via sourcesApi.get in useEffect instead of the existing useSource query hook.

Files:
- frontend/src/components/source/SourceDetailContent.tsx (~66–100)
- frontend/src/lib/hooks/use-sources.ts (useSource)
- Call sites of SourceDetailContent

Architecture:
- Replace manual fetch/state with useSource (or documented equivalent).
- Wire loading/error UI to query states; keep existing detail actions.
- Ensure cache invalidation remains correct after mutations used on the page.
- Preserve accessibility and responsive layout.
- Add/adjust tests if present; otherwise verify typecheck/lint.
- Summarize files changed and verification completed.

Acceptance criteria:
- No manual sourcesApi.get effect for initial load in SourceDetailContent.
- Detail page still loads, refreshes, and updates correctly with cache.
```

---

# UI-033: Labeled refresh buttons bypass PageRefreshButton

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Extends prior `PageRefreshButton` (UI-015)
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations

## Problem

`PageRefreshButton` standardizes icon refresh + aria-label on many list pages, but EpisodesTab and tools detail still hand-roll labeled Refresh icons with divergent markup.

## Current state

- Shared: `frontend/src/components/layout/PageRefreshButton.tsx`
- Bypass: `frontend/src/components/podcasts/EpisodesTab.tsx` ~98–110 (`RefreshCcw` + visible label)
- Bypass: `frontend/src/app/(dashboard)/tools/[id]/page.tsx` ~193–206 (`RefreshCw` + responsive label)
- Good adopters: projects, artifacts, skills, tools list, templates, images, settings

## Goal state

- Extend `PageRefreshButton` with an optional `showLabel` / `label` variant
- Migrate EpisodesTab and tools/[id]
- Preserve responsive label hiding if needed via props

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
EpisodesTab and tools/[id] implement custom labeled refresh buttons instead of PageRefreshButton.

Files:
- frontend/src/components/layout/PageRefreshButton.tsx
- frontend/src/components/layout/PageRefreshButton.test.tsx
- frontend/src/components/podcasts/EpisodesTab.tsx (~98–110)
- frontend/src/app/(dashboard)/tools/[id]/page.tsx (~193–206)

Architecture:
- Extend PageRefreshButton with an optional labeled variant (composition/prop), keeping icon-only default.
- Migrate the two bypasses.
- Preserve disabled/loading spin behavior and i18n.
- Update unit tests.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Labeled refresh uses the shared control.
- Visual behavior on episodes/tools detail preserved.
```

---

# UI-037: ChatPanelMessages empty conversation bypasses EmptyState

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse

## Problem

The chat empty conversation state is a one-off centered muted paragraph, while manage pages standardized on `EmptyState`. Even if chat wants a quieter treatment, a compact EmptyState variant would keep structure/accessibility consistent.

## Current state

- `frontend/src/components/source/ChatPanelMessages.tsx` lines 165–178 — custom `emptyState` div/paragraph
- Shared: `frontend/src/components/common/EmptyState.tsx` (dashed border + icon + title) used widely elsewhere
- Chat empty is contextual/inline — visual quietness may be intentional; still a reuse opportunity via variant

## Goal state

- Use `EmptyState` with a `variant="subtle"` (or similar) without dashed border/icon if product prefers quiet chat empty
- Or accept EmptyState as-is if visual change is approved
- Preserve immersive vs compact padding classes

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ChatPanelMessages uses a custom empty conversation block instead of EmptyState.

Files:
- frontend/src/components/source/ChatPanelMessages.tsx (~165–178)
- frontend/src/components/common/EmptyState.tsx
- frontend/src/components/common/EmptyState.test.tsx

Architecture:
- Prefer extending EmptyState with a subtle/compact variant rather than a new component.
- Migrate ChatPanelMessages emptyState to the shared component.
- Preserve immersive padding behavior and i18n copy.
- Update EmptyState tests for the variant.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Chat empty state uses shared EmptyState (possibly subtle variant).
- Copy and layout density remain appropriate for chat.
```

---

## Final Assessment

### Recommended implementation order

1. **UI-027** `useListSelection` — highest ROI, unblocks consistent bulk UX, small/medium scope
2. **UI-026** shared chat session/send runtime — largest remaining behavioral twin; build on existing helpers
3. **UI-034** split api-keys monolith — enables cleaner UI-028 migration
4. **UI-029** `PickerDialogShell` — Template/Skill near-clones
5. **UI-028** extend `ModelSelector`
6. **UI-040** promote `FormDialogShell` for rename dialogs
7. **UI-039** `CompactListRow` + a11y navigation parity
8. **UI-038** sidebar Link/Button nesting + `aria-current`
9. **UI-031** destructive token sweep
10. **UI-035** residual icon/English aria + skills ConfirmDialog
11. **UI-032** shared PageError
12. **UI-036** SourceDetailContent → `useSource`
13. **UI-033** labeled `PageRefreshButton`
14. **UI-037** chat EmptyState variant

### Shared components / hooks that should become frontend standards

- `useListSelection`
- Shared chat session/send runtime (on top of existing SSE/queue helpers)
- `PickerDialogShell`
- Extended `ModelSelector` (default/clear/compact/required)
- `FormDialogShell` (promoted from podcast shell)
- `CompactListRow`
- `PageError` / subtle `EmptyState` variant
- Continued standards: `ConfirmDialog`, `EmptyState`, `PageHeader`, `PageRefreshButton`, `ListSelectionBar`, `LoadingSkeletons`, dialog class tokens

### Existing components / patterns that should be deprecated after migration

- Inline Set selection blocks in SourcesColumn/ArtifactsColumn (after UI-027)
- Ad-hoc model SelectItem maps in ChatModelOverrideDialog and DefaultModelSelectors (after UI-028)
- Duplicated picker chrome in TemplatePicker/SkillPicker (after UI-029)
- Hardcoded `text-red-*` destructive styling for error/destructive actions (after UI-031)
- `window.confirm` in skills dirty navigation (after UI-035)
- Manual `sourcesApi.get` effect in SourceDetailContent (after UI-036)

### Areas inspected and found consistent

- ConfirmDialog adoption for simple deletes (21 call sites; only complex AlertDialogs remain intentional)
- EmptyState + ListRowsSkeleton on primary manage pages
- PageHeader + page layout class tokens on most dashboard routes
- Podcast `ProfilePanelFrame` / `PodcastProfileFormDialogShell` within podcast domain
- ChatPanel composition (`ChatSessionHeader`, `ChatPanelMessages`, `ChatContextStrip`, `ChatComposer`)
- Shared chat helpers: queue, SSE handlers, streaming buffer, session selection
- Route `loading.tsx` → `DashboardContentSkeleton` pattern
- Foundation unit tests for core shared components

### Areas that could not be inspected (or only shallowly)

- Full A2UI catalog component matrix beyond chat surface integration
- Knowledge-graph Unity control internals
- Share-route edge cases beyond ChatPanel reuse
- Exhaustive locale completeness / screenshot visual QA
- Storybook (not present)

### Categories preventing a higher score

- **Duplication (3.5)** and **Shared Behavior (3.4):** residual chat-hook and list-selection twins
- **Composition (3.3):** api-keys / SourceCard / column monoliths
- **A11y (3.2):** foundational nav nesting + residual unlabeled controls
- **Design-System (3.5):** destructive token drift
- **Testing (3.2):** no Storybook; feature hooks/cards lightly tested

### Changes most likely to improve the score

1. Land UI-027 + UI-026 (largest duplication/behavior gains)
2. Split UI-034 and extend ModelSelector (composition + reuse)
3. Fix UI-038 + UI-035 (a11y foundational chrome)
4. Token sweep UI-031 (design-system consistency)
5. Expand tests around new shared hooks/shells

### Overall frontend component architecture assessment

The frontend has a **real and used shared foundation** (shadcn/ui primitives, EmptyState, ConfirmDialog, PageHeader/Refresh, LoadingSkeletons, ListSelectionBar, composed ChatPanel, podcast shells, and a solid chat helper stack). Post-remediation gains from UI-013–UI-025 remain intact. The architecture is **stable at 72/100**: one Medium ConfirmDialog bypass disappeared with insights removal, but the high-value backlog (list selection, chat hook residual, api-keys monolith, picker/model shells) is unchanged, and foundational nav a11y nesting is now explicitly tracked. Continued progress depends on finishing the remaining prefab-style extractions rather than adding parallel one-offs.

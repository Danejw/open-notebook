# Frontend Architecture Score: 64/100

**Previous score:** Not published (2026-07-15 run listed 12 issues and landed fixes; no formal 0–100 scorecard)
**Change:** N/A (first scored weekly audit)
**Audit coverage:** 86% — High coverage
**Comparison status:** Baseline for scored tracking — Not directly comparable to the prior issue-fix run (different deliverable shape; prior run focused on finding/fixing UI-001–UI-012 rather than publishing category ratings)
**Architecture trend:** Improving (UI-001–UI-012 verified still resolved; residual issues are fewer and mostly Medium/Low)

**Issues found:** 13 (High: 3, Medium: 7, Low: 3)
**Most repeated frontend pattern:** Identical page-header refresh icon buttons across dashboard pages, plus residual ConfirmDialog / FieldError bypasses in older feature surfaces
**Highest-value refactor:** Finish ConfirmDialog adoption for remaining simple deletes, then extract shared chat session/SSE behavior beyond `useChatStreamingBuffer`

---

## Scorecard

| Scoring Category                                 |  Weight | Rating |   Points Earned | Evidence Summary |
| ------------------------------------------------ | ------: | -----: | --------------: | ---------------- |
| Shared Component Reuse                           |      25 |    3.8 |            19.0 | Strong shared foundations (`EmptyState`, `ConfirmDialog`, `FieldError`, `LoadingSkeletons`, `PageHeader`, `ui/*`) with broad adoption after UI-001–UI-012; residual bypasses in source/document delete confirms, `SourceTypeStep` field errors, and refresh buttons |
| Duplication and One-Off Implementations          |      20 |    3.2 |            12.8 | Major twins reduced (project menus, podcast headers/actions, streaming buffer); remaining duplication in podcast panel/form lifecycle, chat hooks, and page refresh chrome |
| Composition and Component API Quality            |      15 |    2.8 |             8.4 | Good primitive APIs (`ConfirmDialog`, `EmptyState`, `PageHeader`); large surfaces remain (`ChatPanel`, `SourceCard`, `api-keys/page.tsx`, `GeneratePodcastDialog`) with prop/callback sprawl |
| Design-System and Styling Consistency            |      15 |    3.3 |             9.9 | Tokenized `globals.css` + Tailwind theme + ui CLAUDE conventions; inconsistent destructive styling (`bg-red-600` / `text-red-600` vs `text-destructive`) and local density overrides in source wizard |
| Shared Behavior, State, and Frontend Logic       |      10 |    3.0 |             6.0 | TanStack Query hooks, modal manager, streaming buffer, model-name map present; `useProjectChat`/`useSourceChat` still duplicate session/SSE/queue flows |
| Accessibility and Responsive Consistency         |      10 |    2.8 |             5.6 | Radix primitives and many `aria-label`s; unlabeled sidebar/session icon buttons, native `confirm()` deletes, no mobile Sheet/Drawer for app sidebar |
| Validation, Testing, and Component Documentation |       5 |    2.5 |             2.5 | `ConfirmDialog` + several hooks tested; ui/hooks CLAUDE docs exist; no Storybook; `EmptyState`/`FieldError`/`LoadingSkeletons`/`PageHeader`/`ui/button` lack direct tests |
| **Total**                                        | **100** |        |       **64/100** |                  |

### Category rating notes

1. **Shared Component Reuse (3.8):** Affirmative evidence of reuse across lists, dialogs, and pages. No competing EmptyState/ConfirmDialog implementations. Remaining Medium-severity ConfirmDialog bypasses keep this below 4.5.
2. **Duplication (3.2):** Noticeable but not dominant after the fix wave. Podcast panels/forms and chat hooks are the primary residual clusters.
3. **Composition (2.8):** Primitives are composable; feature shells often concentrate unrelated responsibilities instead of composing smaller units.
4. **Design-System (3.3):** Main system exists and is documented; exceptions are repeated enough to matter (destructive colors, source-wizard density).
5. **Shared Behavior (3.0):** Shared hooks exist and are used, but chat domain logic is still largely reimplemented twice.
6. **A11y/Responsive (2.8):** Acceptable baseline via Radix; meaningful gaps in icon-only controls, native confirms, and mobile shell adaptation.
7. **Testing/Docs (2.5):** Partial coverage with important foundational gaps; documentation for ui/hooks is stronger than automated validation.

---

## Issue table

| Order | Issue ID | Severity | Confidence | Effort | Component or Pattern | Locations | Scoring Categories | Recommended Action |
| ----- | -------- | -------- | ---------- | ------ | -------------------- | --------- | ------------------ | ------------------ |
| 1 | UI-013 | High | High | Small | Native `confirm()` deletes | SourceDetailContent, documents/[id] | Reuse, A11y, Behavior | Migrate to `ConfirmDialog` |
| 2 | UI-014 | Medium | High | Small | FieldError bypass | SourceTypeStep | Reuse, Design-System | Replace raw field error `<p>` with `FieldError` |
| 3 | UI-015 | Medium | High | Small | Page refresh icon button | 7 dashboard pages | Duplication, Reuse | Extract `PageRefreshButton` |
| 4 | UI-016 | Medium | High | Small | SessionManager empty/loading/a11y | SessionManager | Reuse, Duplication, A11y | Use EmptyState + DialogBodyLoading/skeleton; add aria-labels |
| 5 | UI-017 | Low | High | Small | listActionTriggerClassName bypass | ArtifactsColumn note row | Reuse, Design-System | Apply shared trigger class |
| 6 | UI-018 | Medium | High | Medium | Podcast profile panel lifecycle | SpeakerProfilesPanel, EpisodeProfilesPanel | Duplication, Composition | Extract `ProfilePanelFrame` with render props |
| 7 | UI-019 | Medium | High | Medium | Podcast profile form shell | EpisodeProfileFormDialog, SpeakerProfileFormDialog | Duplication, Composition | Extract shared form dialog shell |
| 8 | UI-020 | High | High | Large | Chat hook session/SSE dup | useProjectChat, useSourceChat | Duplication, Behavior, Composition | Extract shared chat session/SSE/queue core |
| 9 | UI-021 | High | High | Large | ChatPanel prop sprawl | ChatPanel, ChatColumn, ChatMessageList | Composition, Behavior | Split into composed subcomponents/context |
| 10 | UI-022 | Medium | High | Small | Sidebar icon button a11y | AppSidebar | A11y | Add aria-labels to collapse/expand controls |
| 11 | UI-023 | Low | High | Small | ConfirmDialog destructive tokens | ConfirmDialog | Design-System | Use destructive Button variant/token classes |
| 12 | UI-024 | Low | High | Small | Document detail loading text | documents/[id]/page | Reuse, Duplication | Use shared skeleton / DialogBodyLoading pattern |
| 13 | UI-025 | Medium | High | Medium | Foundation test gaps | EmptyState, FieldError, LoadingSkeletons, PageHeader, ui/button | Testing | Add focused unit tests for shared foundations |

---

# UI-013: Remaining native `confirm()` deletes bypass `ConfirmDialog`

**Severity:** High
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse; Accessibility and Responsive Consistency; Shared Behavior, State, and Frontend Logic

## Problem

Simple destructive confirms still use the browser `confirm()` / `window.confirm()` API in two delete flows. That bypasses the shared accessible `ConfirmDialog`, creating inconsistent UX and weaker keyboard/screen-reader behavior than the rest of the app (which already migrated most deletes in UI-001).

## Current state

- Shared component exists: `frontend/src/components/common/ConfirmDialog.tsx`
- Source delete still uses native confirm:
  - `frontend/src/components/source/SourceDetailContent.tsx` (`handleDelete`, ~353–365); trigger ~440
  - Insight delete in the same file already uses `ConfirmDialog` (~759)
- Document delete still uses native confirm:
  - `frontend/src/app/(dashboard)/documents/[id]/page.tsx` (`handleDelete`, ~264–269); trigger ~337
- Intentional exceptions that should remain raw `AlertDialog`:
  - `ProjectDeleteDialog` (complex preview/options)
  - `EmbeddingModelChangeDialog` (multi-action explanatory confirm)
- Skills unsaved navigation guard (`skills/[id]/page.tsx` ~131) uses `window.confirm` for dirty-state navigation; treat separately (not a delete dialog)

## Goal state

- Source delete and document delete use `ConfirmDialog` with `confirmVariant="destructive"`, loading state during mutation, and existing copy keys.
- Preserve success/error toasts and post-delete navigation/close behavior.
- Verify: no `confirm(` / `window.confirm(` remain for these two delete paths; dialog open/cancel/confirm works via keyboard.

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
Two simple delete flows still use native browser confirm APIs instead of the shared ConfirmDialog:
1) frontend/src/components/source/SourceDetailContent.tsx — handleDelete uses confirm(...)
2) frontend/src/app/(dashboard)/documents/[id]/page.tsx — handleDelete uses window.confirm(...)

Shared component to use:
frontend/src/components/common/ConfirmDialog.tsx
(props: open, onOpenChange, title, description, confirmText?, confirmVariant?, onConfirm, isLoading?)

Requirements:
- Migrate both delete flows to ConfirmDialog with confirmVariant="destructive".
- Preserve existing i18n strings, toast success/error behavior, and post-delete navigation/onClose.
- Prefer local open state + ConfirmDialog composition over boolean prop sprawl.
- Do not migrate ProjectDeleteDialog or EmbeddingModelChangeDialog (intentionally complex).
- Do not change the skills dirty-navigation window.confirm unless you can preserve identical guard behavior with an accessible alternative.
- Update/add tests if ConfirmDialog consumers need coverage for these flows.
- Run frontend typecheck/lint/tests relevant to touched files.
- Summarize files changed and verification completed.

Acceptance criteria:
- Neither SourceDetailContent source delete nor documents/[id] delete uses native confirm.
- ConfirmDialog appears, cancels cleanly, and deletes on confirm with loading disabled state.
- Accessibility: dialog title/description present; focus managed by Radix AlertDialog.
```

---

# UI-014: `SourceTypeStep` field errors bypass `FieldError`

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None (`FieldError` already exists)
**Scoring categories affected:** Shared Component Reuse; Design-System and Styling Consistency

## Problem

Form dialogs were migrated to `FieldError` (UI-004), but the source creation wizard still renders raw `<p className="text-sm text-destructive">` for react-hook-form field messages. This recreates field-error markup inconsistently (size/spacing differ from `FieldError`'s `mt-1 text-xs`).

## Current state

- Shared: `frontend/src/components/common/FieldError.tsx` (`mt-1 text-xs text-destructive`)
- Bypass locations in `frontend/src/components/sources/steps/SourceTypeStep.tsx`:
  - `errors.url` ~202–204
  - `errors.file` ~265–267
  - over-limit message ~268–269 (related validation copy; may stay custom if not a field message)
  - `errors.content` ~293–294
  - `errors.type` ~303–304
  - `errors.title` ~325–326
- Multi-line URL validation list (~205–223) is a richer error summary and should remain feature-specific (not forced into `FieldError`).

## Goal state

- Single-field RHF messages use `<FieldError message={...} />`.
- Rich multi-error lists remain custom.
- Visual consistency with other forms; no behavior change to validation.

## Prompt to fix it

```text
Inspect frontend/src/components/sources/steps/SourceTypeStep.tsx and frontend/src/components/common/FieldError.tsx before editing.

Problem:
SourceTypeStep still renders raw destructive <p> tags for react-hook-form field errors instead of FieldError, unlike ArtifactEditorDialog, NoteEditorDialog, CreateProjectDialog, and podcast profile form dialogs.

Tasks:
- Replace single-field error paragraphs (errors.url, errors.file, errors.content, errors.type, errors.title) with FieldError.
- Keep the multi-line urlValidationErrors summary block as-is (feature-specific).
- Keep non-field status/error panels elsewhere untouched.
- Prefer composition; do not expand FieldError with boolean props for list errors.
- Run lint/typecheck for touched files and summarize changes.

Acceptance criteria:
- No raw single-field error <p className="text-sm text-destructive"> remains for RHF field messages in SourceTypeStep.
- FieldError imported and used; validation still displays the same messages.
```

---

# UI-015: Duplicate page refresh icon button across dashboard pages

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Component Reuse

## Problem

Seven dashboard pages independently recreate the same outline icon refresh control (`Button` outline, `h-7 w-7 p-0`, `RefreshCw h-3.5 w-3.5`, `aria-label={t('common.refresh')}`). This is true structural duplication with no meaningful behavioral differences beyond the `onClick` handler.

## Current state

Near-identical implementations in:

- `frontend/src/app/(dashboard)/projects/page.tsx` ~73–75
- `frontend/src/app/(dashboard)/artifacts/page.tsx` ~33–35
- `frontend/src/app/(dashboard)/skills/page.tsx` ~21–23
- `frontend/src/app/(dashboard)/tools/page.tsx` ~37–45
- `frontend/src/app/(dashboard)/images/page.tsx` ~111–119
- `frontend/src/app/(dashboard)/templates/page.tsx` ~93–101
- `frontend/src/app/(dashboard)/settings/page.tsx` ~22–24

`PageHeader` already accepts an `actions` slot (`frontend/src/components/layout/PageHeader.tsx`). No shared refresh button exists.

`tools/[id]/page.tsx` uses a different labeled refresh control — keep feature-specific.

## Goal state

- New small presentational component, e.g. `PageRefreshButton` under `components/layout/` or `components/common/`, with `onClick` and optional `disabled`/`isRefreshing`.
- All seven identical usages migrate to it.
- Keep spinning/disabled behavior configurable if any page needs it later via props, not forks.

## Prompt to fix it

```text
Inspect these files before editing:
- frontend/src/app/(dashboard)/projects/page.tsx
- frontend/src/app/(dashboard)/artifacts/page.tsx
- frontend/src/app/(dashboard)/skills/page.tsx
- frontend/src/app/(dashboard)/tools/page.tsx
- frontend/src/app/(dashboard)/images/page.tsx
- frontend/src/app/(dashboard)/templates/page.tsx
- frontend/src/app/(dashboard)/settings/page.tsx
- frontend/src/components/layout/PageHeader.tsx

Problem:
Seven pages duplicate the same refresh icon button markup.

Intended architecture:
Create a small PageRefreshButton primitive (layout or common) that wraps Button + RefreshCw and uses t('common.refresh') for aria-label. Accept onClick and optional disabled. Do not invent a large page shell for this issue.

Tasks:
- Add PageRefreshButton.
- Replace the seven identical usages.
- Do not change tools/[id] labeled refresh unless it becomes a clear fit without API contortions.
- Preserve existing refetch behavior.
- Add a tiny unit test for aria-label/render if practical.
- Run lint/typecheck; summarize files changed.

Acceptance criteria:
- The duplicated outline icon refresh markup exists in one shared component.
- All seven pages compile and still refresh on click.
```

---

# UI-016: `SessionManager` hand-rolls empty/loading UI and unlabeled icon actions

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations; Accessibility and Responsive Consistency

## Problem

`SessionManager` recreates an empty-state layout (icon + title + description) instead of `EmptyState`, uses plain loading text instead of shared loading primitives, and ships icon-only edit/delete buttons without `aria-label`. Delete already correctly uses `ConfirmDialog`.

## Current state

`frontend/src/components/source/SessionManager.tsx`:

- Loading text ~147–150
- Inline empty clone ~151–156
- Edit/delete icon buttons without labels ~200–215
- ConfirmDialog for delete already present (~245)

Shared targets: `EmptyState`, `DialogBodyLoading` or a compact skeleton, Button `aria-label` pattern used elsewhere.

## Goal state

- Loading uses a shared loading primitive appropriate to the dialog body.
- Empty uses `EmptyState` with `MessageSquare` icon and existing copy.
- Edit/delete buttons have accessible names via `aria-label` (and optionally `title`).
- Selection/edit/delete behavior unchanged.

## Prompt to fix it

```text
Inspect frontend/src/components/source/SessionManager.tsx, EmptyState.tsx, and LoadingSkeletons.tsx (DialogBodyLoading) before editing.

Problem:
SessionManager hand-rolls loading/empty UI and has unlabeled icon-only edit/delete buttons, while delete already uses ConfirmDialog.

Tasks:
- Replace loading text with DialogBodyLoading or an appropriate shared skeleton.
- Replace empty clone with EmptyState (icon MessageSquare, existing i18n strings).
- Add aria-label to edit and delete icon buttons using existing translation keys where available.
- Do not redesign session list selection behavior.
- Prefer composition; avoid new boolean-heavy wrappers.
- Run lint/typecheck; summarize verification.

Acceptance criteria:
- No custom centered empty icon/title block remains.
- Icon-only buttons expose accessible names.
- ConfirmDialog delete path still works.
```

---

# UI-017: Note row actions bypass `listActionTriggerClassName`

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse; Design-System and Styling Consistency

## Problem

UI-012 standardized hover/focus/open opacity for list action triggers via `listActionTriggerClassName`, but the note action menu in `ArtifactsColumn` still hard-codes a subset of that pattern and omits `group-focus-within` / `data-[state=open]` / `focus-visible` handling.

## Current state

- Shared constant: `frontend/src/lib/utils/list-action-trigger.ts`
- Applied in ProjectActionsMenu, ArtifactCard, SourceCard, templates page, SkillFileTree
- Bypass: `frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx` ~744–749
  - `className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"`

## Goal state

- Note row trigger uses `cn('h-7 w-7 p-0', listActionTriggerClassName)` (or equivalent).
- Keyboard/open visibility matches other list cards.

## Prompt to fix it

```text
Inspect frontend/src/lib/utils/list-action-trigger.ts and ArtifactsColumn.tsx (~note row DropdownMenuTrigger Button around line 744).

Problem:
Note row action trigger duplicates a weaker opacity pattern instead of listActionTriggerClassName.

Tasks:
- Import listActionTriggerClassName and apply it with cn(...) on the trigger Button.
- Remove redundant opacity/transition classes covered by the constant.
- Preserve aria-label and stopPropagation behavior.
- No broader ArtifactsColumn refactors.
- Verify typecheck/lint; summarize.

Acceptance criteria:
- Trigger visibility matches ArtifactCard/SourceCard/ProjectActionsMenu behavior including open/focus-within states.
```

---

# UI-018: Podcast profile panels still duplicate lifecycle after shared extraction

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Prefer after UI-015 only if touching shared podcast layout; otherwise independent
**Scoring categories affected:** Duplication and One-Off Implementations; Composition and Component API Quality

## Problem

UI-007 extracted `PodcastPanelHeader`, `ProfileCardActions`, and `useModelNameMap`, but `SpeakerProfilesPanel` and `EpisodeProfilesPanel` still duplicate create/edit/delete modal state, sorted lists, empty-state wiring, form dialog mounting, and ConfirmDialog wiring.

## Current state

- Shared pieces already used:
  - `frontend/src/components/podcasts/PodcastPanelHeader.tsx`
  - `frontend/src/components/podcasts/ProfileCardActions.tsx`
  - `frontend/src/lib/hooks/use-model-name-map.ts`
- Remaining twins:
  - `frontend/src/components/podcasts/SpeakerProfilesPanel.tsx` (~35–66, ~163–190)
  - `frontend/src/components/podcasts/EpisodeProfilesPanel.tsx` (~43–81, ~194–222)
- Card bodies differ (speaker voice vs episode config) and should stay separate.
- Episode panel has an extra “create speaker first” banner — must remain configurable.

## Goal state

- A `ProfilePanelFrame` (or similar) owns sorting, empty state, create/edit/delete state, ConfirmDialog, and header create button.
- Panels pass render props / children for card content and form dialogs.
- Avoid a mega boolean API; use composition (`renderCard`, `renderCreateDialog`, `renderEditDialog`, optional `banner`).

## Prompt to fix it

```text
Inspect SpeakerProfilesPanel.tsx, EpisodeProfilesPanel.tsx, PodcastPanelHeader.tsx, ProfileCardActions.tsx before editing.

Problem:
After extracting header/actions/model-name map, both panels still duplicate lifecycle state and dialog wiring.

Intended architecture:
Introduce a ProfilePanelFrame composed via children/render props:
- owns sortedProfiles, createOpen, editProfile, profileToDelete
- renders PodcastPanelHeader, EmptyState, ConfirmDialog
- calls provided delete/duplicate hooks via injected callbacks
- renders card list via renderCard(profile)
- renders create/edit dialogs via slots

Preserve:
- Episode-only disableCreate + amber banner
- setup-required badges and card-specific metadata
- existing delete disabled-when-in-use behavior for speakers
- i18n strings and ConfirmDialog destructive confirms

Do not merge speaker/episode card body markup into one component.
Avoid excessive boolean props.

Migrate both panels, remove obsolete duplicated state blocks, add/adjust tests if present, run lint/typecheck, summarize.
```

---

# UI-019: Podcast profile form dialogs duplicate shell/footer

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Independent of UI-018; can land before or after
**Scoring categories affected:** Duplication and One-Off Implementations; Composition and Component API Quality

## Problem

`EpisodeProfileFormDialog` and `SpeakerProfileFormDialog` share nearly identical create/edit mode scaffolding: defaults callback, reset-on-open, mutation branching, `isSubmitting`, dialog chrome (`max-w-2xl overflow-y-auto`), form spacing, and Cancel/Save footer.

## Current state

- `frontend/src/components/podcasts/forms/EpisodeProfileFormDialog.tsx` (~74–139, footer ~319–333)
- `frontend/src/components/podcasts/forms/SpeakerProfileFormDialog.tsx` (~76–151, footer ~312–326)
- Both already use `FieldError` and `ModelSelector`
- Field bodies differ substantially (episode outline/transcript vs dynamic speaker array) — keep separate

## Goal state

- Shared shell handles dialog open/mode, reset, submitting footer.
- Field schemas/bodies remain in feature files.
- Composition via children for fields; shell owns footer actions.

## Prompt to fix it

```text
Inspect EpisodeProfileFormDialog.tsx and SpeakerProfileFormDialog.tsx before editing.

Problem:
Create/edit dialog shell, reset effects, and footer are duplicated; field bodies are intentionally different.

Intended architecture:
Extract a PodcastProfileFormDialogShell (or FormDialogShell) that accepts:
- open/onOpenChange, title, isSubmitting, onSubmit, children (fields)
- optional mode label handling
Keep zod schemas and field UIs in the specific dialog files.

Preserve all validation, ModelSelector usage, FieldError usage, and mutation side effects.
Prefer children composition over boolean props for field variants.
Remove duplicated footer markup after migration.
Run lint/typecheck; summarize files changed and verification.
```

---

# UI-020: `useProjectChat` / `useSourceChat` still duplicate session, SSE, and queue cores

**Severity:** High
**Confidence:** High
**Estimated effort:** Large
**Dependencies:** Builds on existing `useChatStreamingBuffer` (UI-011, already done)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Behavior, State, and Frontend Logic; Composition and Component API Quality

## Problem

Streaming buffer extraction reduced duplication, but the two chat hooks (~835 and ~608 lines) still independently implement session query/selection, create/update/delete mutations, SSE event switches, and queue merge/status derivation. Drift risk remains high.

## Current state

- Shared: `frontend/src/lib/hooks/useChatStreamingBuffer.ts` (+ tests)
- Consumers:
  - `frontend/src/lib/hooks/useProjectChat.ts`
  - `frontend/src/lib/hooks/useSourceChat.ts`
- Still duplicated (representative):
  - Session list/current session queries and auto-select latest
  - Session CRUD mutation shapes
  - SSE event handling (`TEXT_MESSAGE_*`, tool calls, etc.)
  - Queue merge/status derivation
- Intentional differences to preserve:
  - Project context building from sources/notes; guest/shared mode
  - Source abort/cancel and `contextIndicators`

## Goal state

- Extract a focused shared core (e.g. `useChatSessionController` + `useChatSseHandlers` or one carefully scoped `useChatRuntime`) for the truly identical flows.
- Keep project/source wrappers thin for domain-specific context and API endpoints.
- Prefer composition of hooks over a single boolean-heavy mega-hook.
- Expand unit tests around extracted helpers (pattern already established by `useChatStreamingBuffer.test.ts`).

## Prompt to fix it

```text
Inspect useChatStreamingBuffer.ts, useProjectChat.ts, useSourceChat.ts, and their tests before editing.

Problem:
After streaming-buffer extraction, session management, SSE switching, and queue status logic remain largely duplicated between useProjectChat and useSourceChat.

Intended architecture:
1. Identify identical blocks by reading both hooks side-by-side (do not assume docs).
2. Extract shared pure helpers and/or hooks for:
   - session list selection defaults
   - SSE event apply functions (message start/content/tool call updates)
   - queue item merge/status derivation
3. Keep project-only context building and source-only abort/contextIndicators in wrappers.
4. Prefer composition of small hooks/helpers over one boolean-prop mega hook.
5. Preserve public return shapes used by ChatPanel/ChatColumn unless you update all consumers in the same change.
6. Add unit tests for extracted helpers mirroring useChatStreamingBuffer.test.ts rigor.
7. Run frontend unit tests and tsc; summarize.

Acceptance criteria:
- Duplicated SSE/session/queue blocks live in one shared module.
- Project and source chat still stream, queue, create/select/delete sessions correctly.
- No behavior regressions in shared vs guest modes.
```

---

# UI-021: `ChatPanel` concentrates unrelated UI responsibilities behind a large prop surface

**Severity:** High
**Confidence:** High
**Estimated effort:** Large
**Dependencies:** Prefer after or alongside UI-020 so behavior ownership is clearer
**Scoring categories affected:** Composition and Component API Quality; Shared Behavior, State, and Frontend Logic

## Problem

`ChatPanel` (~661 lines) accepts a very large props bundle spanning sessions, streaming, queue, model override, tools/skills/templates, artifacts, and composer controls. `ChatColumn` forwards a wide prop object into it. This makes reuse and incremental UI changes expensive and encourages further prop growth.

## Current state

- `frontend/src/components/source/ChatPanel.tsx` props ~67–139; render continues through ~661
- `frontend/src/app/(dashboard)/projects/components/ChatColumn.tsx` prop pass-through ~116–161
- Related wide surfaces: `ChatMessageList.tsx`, `ChatMessageRow.tsx`
- Some booleans are legitimate modes (`embedded`, `sharedMode`) — keep those; split by responsibility instead

## Goal state

- Compose ChatPanel from focused subcomponents or lightweight contexts (session header, queue panel, composer, message list).
- Reduce prop drilling where state already comes from hooks.
- Preserve all existing chat behaviors, immersive layout, and tests (`ChatPanel.queue.test.tsx`, `ChatColumn.test.tsx`).

## Prompt to fix it

```text
Inspect ChatPanel.tsx, ChatColumn.tsx, ChatMessageList.tsx, ChatMessageRow.tsx, and existing chat tests before editing.

Problem:
ChatPanel's prop surface couples unrelated chat concerns, forcing ChatColumn to assemble a large callback/state bundle.

Intended architecture:
Split by responsibility using composition:
- Session controls
- Queue controls
- Composer (model/tools/templates)
- Message list/row actions
Use React context or colocated hooks where it reduces props without hiding ownership.

Preserve embedded/shared modes and all queue/streaming behaviors.
Avoid a single component with dozens of boolean flags.
Update tests; run vitest for chat-related suites and tsc; summarize.

Acceptance criteria:
- ChatPanel props shrink meaningfully OR ownership moves into composed children/context with clear boundaries.
- Existing queue/chat tests pass.
- No user-visible regression in project or source chat UIs.
```

---

# UI-022: App sidebar collapse controls missing accessible names

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Accessibility and Responsive Consistency

## Problem

Sidebar collapse/expand icon buttons lack `aria-label`, unlike other icon-only controls in the same sidebar (create, sign out). Screen-reader users cannot determine the control purpose from the icon alone.

## Current state

`frontend/src/components/layout/AppSidebar.tsx`:

- Collapsed hover menu button ~207–214 — no `aria-label`
- Expanded collapse button ~224–232 — has `data-testid="sidebar-toggle"` but no `aria-label`
- Nearby correctly labeled controls: create ~254, sign out ~371/384

Note: App shell also lacks a mobile Sheet/Drawer pattern (`AppShell.tsx` always renders fixed sidebar). That is a larger responsive issue; do not conflate it into this small a11y fix unless explicitly expanding scope.

## Goal state

- Both toggle buttons expose translated accessible names (expand/collapse).
- Existing collapse behavior and tests (`AppSidebar.test.tsx`) remain green.

## Prompt to fix it

```text
Inspect frontend/src/components/layout/AppSidebar.tsx and AppSidebar.test.tsx before editing.

Problem:
Collapse/expand icon-only buttons lack aria-label.

Tasks:
- Add aria-label (and title if consistent with nearby controls) for both collapsed and expanded toggle buttons.
- Reuse existing i18n keys if present; otherwise add minimal keys without rewriting unrelated copy.
- Keep data-testid="sidebar-toggle".
- Update AppSidebar tests to assert accessible names.
- Run the sidebar test file; summarize.

Acceptance criteria:
- Both toggle buttons have accessible names.
- Collapse behavior unchanged.
```

---

# UI-023: `ConfirmDialog` destructive action uses hard-coded red classes

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None (foundational shared component — keep change minimal)
**Scoring categories affected:** Design-System and Styling Consistency

## Problem

The shared confirm primitive applies `bg-red-600 hover:bg-red-700` for destructive confirms instead of design-system destructive tokens / Button destructive variant. This teaches consumers the wrong pattern and can drift from theme tokens (including dark mode).

## Current state

- `frontend/src/components/common/ConfirmDialog.tsx` ~66
- Tests: `ConfirmDialog.test.tsx`
- Elsewhere, many menus correctly use `text-destructive` / `variant="destructive"` patterns

## Goal state

- Destructive confirm styling uses tokenized destructive classes or the shared Button destructive variant compatible with AlertDialogAction.
- Visual intent remains clearly destructive; dark mode works with theme tokens.
- Existing ConfirmDialog tests updated if they assert class names.

## Prompt to fix it

```text
Inspect ConfirmDialog.tsx, alert-dialog.tsx, button.tsx, and ConfirmDialog.test.tsx before editing.

Problem:
Destructive ConfirmDialog actions hard-code bg-red-600/hover:bg-red-700 instead of design tokens.

Tasks:
- Replace hard-coded red utility classes with destructive token classes or Button destructive variant composition that works with AlertDialogAction.
- Preserve loading spinner behavior and pointer-events cleanup logic.
- Update tests if they assert specific class strings.
- Do not restyle non-destructive confirms.
- Run ConfirmDialog tests; summarize.

Acceptance criteria:
- No raw bg-red-600/hover:bg-red-700 in ConfirmDialog.
- Destructive confirms still read as destructive in light and dark themes.
```

---

# UI-024: Document detail page uses plain loading text

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations

## Problem

Document detail loading renders a plain muted paragraph instead of shared skeleton/loading primitives used across the dashboard, producing inconsistent loading UX.

## Current state

- `frontend/src/app/(dashboard)/documents/[id]/page.tsx` ~272–277
- Shared options: `LoadingSkeletons` / `DialogBodyLoading` / `DashboardContentSkeleton` / page-level skeletons
- Same page still needs UI-013 for delete confirm

## Goal state

- Loading state uses a shared skeleton appropriate for a detail page header + body.
- Loaded UI unchanged.

## Prompt to fix it

```text
Inspect documents/[id]/page.tsx and LoadingSkeletons.tsx / DashboardContentSkeleton.tsx before editing.

Problem:
Document detail loading uses plain text instead of shared loading primitives.

Tasks:
- Replace the plain loading paragraph with an existing shared skeleton that fits a detail page.
- Do not invent a new skeleton family unless none fit.
- Preserve PageHeader and actions once loaded.
- Optionally land with UI-013 in the same PR if touching this file, but keep commits/logical changes clear.
- Run lint/typecheck; summarize.

Acceptance criteria:
- No bare common.loading text-only loading state on this page.
- Loading appearance aligns with other dashboard detail loading patterns.
```

---

# UI-025: Foundational shared components lack direct tests

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Ideally after small API tweaks from UI-014/UI-015/UI-023 so tests lock final APIs
**Scoring categories affected:** Validation, Testing, and Component Documentation

## Problem

Shared foundations are documented in CLAUDE.md files and used widely, but direct automated coverage is thin. Only `ConfirmDialog` among the named common foundations has a dedicated component test. There are no Storybook/story files. Regressions during consolidation are under-protected.

## Current state

- Present tests: `ConfirmDialog.test.tsx`, hook tests (`useChatStreamingBuffer`, `useChatQueue`, `use-modal-manager`, …), some feature tests
- Missing direct tests: `EmptyState`, `FieldError`, `LoadingSkeletons`/`DialogBodyLoading`, `PageHeader`, `ui/button`
- Docs exist: `frontend/src/components/ui/CLAUDE.md`, `frontend/src/lib/hooks/CLAUDE.md`
- Stories: none under `frontend/`

## Goal state

- Lightweight vitest coverage for render/props of EmptyState, FieldError, DialogBodyLoading, PageHeader, and Button variants.
- Stories remain optional; do not require a full Storybook rollout in this issue unless already planned.
- Tests should document intended reuse contracts (optional description, destructive variant, etc.).

## Prompt to fix it

```text
Inspect frontend vitest config, ConfirmDialog.test.tsx as the style template, and the untested foundations:
EmptyState.tsx, FieldError.tsx, LoadingSkeletons.tsx (DialogBodyLoading), PageHeader.tsx, ui/button.tsx.

Problem:
Foundational shared components lack direct unit tests, increasing regression risk during DRY consolidations.

Tasks:
- Add focused vitest files for each listed foundation covering happy-path render and key props/variants.
- Follow existing test setup (frontend/src/test/setup.ts) and ConfirmDialog.test.tsx patterns.
- Do not add Storybook in this task unless already configured.
- Avoid brittle class-name snapshot overkill; assert accessible roles/text/props.
- Run vitest for the new files; summarize coverage added.

Acceptance criteria:
- Each listed foundation has at least one direct test file with meaningful assertions.
- CI/local vitest passes for new tests.
```

---

## Final Assessment

### Recommended implementation order

1. UI-013 ConfirmDialog residual deletes  
2. UI-014 FieldError in SourceTypeStep  
3. UI-015 PageRefreshButton  
4. UI-022 Sidebar aria-labels  
5. UI-016 SessionManager empty/loading/a11y  
6. UI-017 listActionTriggerClassName in ArtifactsColumn  
7. UI-023 ConfirmDialog destructive tokens  
8. UI-024 Document loading skeleton  
9. UI-018 Podcast ProfilePanelFrame  
10. UI-019 Podcast form dialog shell  
11. UI-025 Foundation tests  
12. UI-020 Shared chat session/SSE core  
13. UI-021 ChatPanel composition split  

### Shared components that should become frontend standards

- `ConfirmDialog` for all simple confirms/deletes  
- `EmptyState` for page/list empties  
- `FieldError` for single-field form errors  
- `DialogBodyLoading` / LoadingSkeletons for dialog and page loading  
- `PageHeader` + `pageContentClassName` / `pageSectionGapClassName`  
- `listActionTriggerClassName` for hover/focus list actions  
- Proposed: `PageRefreshButton`, `ProfilePanelFrame`, shared chat session/SSE helpers  

### Existing components that should be deprecated

- Native `confirm()` / `window.confirm()` for in-app destructive actions (except carefully justified navigation guards)  
- Inline empty-state clones that match EmptyState structure  
- Hand-rolled list-action opacity class strings where `listActionTriggerClassName` applies  
- No broad deprecation of feature cards (`SourceCard`, `EpisodeCard`) — they are intentionally specialized  

### Areas inspected and found consistent

- shadcn/Radix `components/ui/*` primitives and CVA patterns  
- Dashboard `PageHeader` adoption across major list pages  
- Post-fix adoption of EmptyState on images/templates/podcasts/artifacts/skills lists  
- ConfirmDialog adoption for podcast profiles, episodes, chat session delete, insight delete  
- `ProjectActionsMenu` shared by ProjectCard/ProjectRow  
- `useChatStreamingBuffer` shared by both chat hooks  
- SettingSelectField usage inside SettingsForm  
- No native `<select>` remaining in `frontend/src`  

### Areas that could not be inspected (or only lightly sampled)

- Runtime browser visual regression / real screen-reader passes  
- Full line-by-line review of `settings/api-keys/page.tsx` (~1433 lines) beyond pattern sampling  
- Share-route guest UI beyond light sampling  
- Knowledge-graph canvas interaction beyond noting intentional hard-coded graph colors  
- Every locale string key completeness  

### Categories preventing a higher score

- Composition (2.8): ChatPanel / SourceCard / api-keys monoliths  
- A11y/Responsive (2.8): unlabeled controls, native confirms, limited mobile shell adaptation  
- Testing/Docs (2.5): thin foundation test coverage, no stories  
- Residual duplication in chat hooks and podcast panels  

### Changes most likely to improve the score

1. Clear remaining ConfirmDialog/FieldError/refresh-button bypasses (Reuse + Duplication)  
2. Extract chat session/SSE shared core (Duplication + Behavior)  
3. Compose ChatPanel into smaller units (Composition)  
4. Add foundation unit tests (Testing)  
5. Tokenize ConfirmDialog destructive styling and tighten a11y labels (Design-System + A11y)  

### Overall frontend component architecture

The frontend has a solid prefab layer (`ui/*` + `common/*` + layout primitives) and recently improved feature adoption (UI-001–UI-012 verified present). The main gap is no longer “missing primitives,” but **incomplete adoption at the edges** and **large feature shells that still rebuild behavior instead of composing the prefabs**. At **64/100** with **86% High coverage**, this is a credible scored baseline: foundations are strong, feature consistency is mixed, and the highest leverage work is finishing residual shared-component adoption while decomposing chat into composable parts.

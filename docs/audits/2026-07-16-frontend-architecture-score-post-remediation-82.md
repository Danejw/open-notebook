# Frontend Architecture Score: 82/100

**Previous score:** 72/100 (2026-07-16 weekly audit — pre UI-026–UI-040 remediation)
**Change:** +10
**Audit coverage:** 91% — High coverage
**Comparison status:** Directly comparable — same scoring rubric, similar High coverage (89% → 91%), and all prior open issues UI-026–UI-040 were re-verified against current remediated source
**Architecture trend:** Improving

**Issues found:** 8 open (High: 0, Medium: 6, Low: 2); 14 prior issues resolved or substantially completed (UI-026–UI-029, UI-031–UI-040; UI-030 already resolved earlier)
**Most repeated frontend pattern:** Residual ToolPicker dialog chrome + selectable-row long-press UX twins + ChatPanel prop wiring across project/source surfaces
**Highest-value refactor:** Migrate ToolPicker onto `PickerDialogShell`, then extract selectable-row interaction helper shared by SourceCard and ArtifactListRow

---

## Scorecard

| Scoring Category                                 |  Weight | Rating |   Points Earned | Evidence Summary |
| ------------------------------------------------ | ------: | -----: | --------------: | ---------------- |
| Shared Component Reuse                           |      25 |    4.5 |            22.5 | FormDialogShell, CompactListRow, PickerDialogShell (2/3), extended ModelSelector, PageError, EmptyState subtle, labeled PageRefreshButton widely adopted; ToolPicker still bypasses picker shell |
| Duplication and One-Off Implementations          |      20 |    4.0 |            16.0 | Column selection, rename dialogs, compact rows, model selects, and chat send core consolidated; residual ToolPicker chrome, selectable-row twins, ChatPanel wiring |
| Composition and Component API Quality            |      15 |    3.8 |            11.4 | api-keys page slimmed to 128 lines; compound CompactListRow/FormDialogShell APIs; ChatPanel remains composed; SourceCard (856) and ArtifactsColumn (820) still large |
| Design-System and Styling Consistency            |      15 |    4.3 |            12.9 | Zero production `text-red-*`/`bg-red-*`; destructive tokens adopted; tokenized globals + ui primitives remain baseline |
| Shared Behavior, State, and Frontend Logic       |      10 |    3.9 |             7.8 | `useListSelection`, shared chat send/enqueue/session/skill/queue helpers, `useSource` in SourceDetailContent; adapters still ~400–600 LOC |
| Accessibility and Responsive Consistency         |      10 |    4.0 |             8.0 | Sidebar `Button asChild` + `aria-current`; no `window.confirm`; CollapsibleColumn i18n aria; residual CredentialItem `title`-only icon buttons |
| Validation, Testing, and Component Documentation |       5 |    3.7 |             3.7 | 35 test files (was ~12); new tests for CompactListRow, PageError, ModelSelector, useListSelection, AppSidebar, chat utils; no Storybook; PickerDialogShell/FormDialogShell/useChatSendTurn untested |
| **Total**                                        | **100** |        |       **82/100** |                  |

### Category rating notes

1. **Shared Component Reuse (4.5):** Affirmative reuse expanded substantially. Remaining Medium bypass (ToolPicker) and incomplete PageError universality keep this below 4.7. No unresolved High reuse issue on a foundational shared component.
2. **Duplication (4.0):** Primary High clusters from the 72 scorecard are gone. Remaining duplication is localized (ToolPicker, selectable rows, ChatPanel wiring) — noticeable but not dominant.
3. **Composition (3.8):** UI-034 api-keys split is the largest composition win. Feature monoliths (`SourceCard`, `ArtifactsColumn`) and still-large chat adapters prevent a higher rating.
4. **Design-System (4.3):** UI-031 destructive-token sweep verified (zero production hardcoded red utilities). Largest single-category gain (+0.8), within ±1.5 guardrail.
5. **Shared Behavior (3.9):** High selection/chat/fetch remediations landed. Residual chat-adapter orchestration and ChatPanel binding duplication cap below 4.2.
6. **A11y/Responsive (4.0):** UI-038 and UI-035 reverse prior residual debt. CredentialItem `title`-only controls are Low residual, not foundational High.
7. **Testing/Docs (3.7):** Test inventory roughly tripled with remediations; gaps remain for new shells (`PickerDialogShell`, `FormDialogShell`) and `useChatSendTurn`. No Storybook.

### Historical comparison (category ratings)

| Category | Previous (72) | Current | Δ |
| -------- | ------------: | ------: | -: |
| Shared Component Reuse | 4.2 | 4.5 | +0.3 |
| Duplication and One-Off Implementations | 3.5 | 4.0 | +0.5 |
| Composition and Component API Quality | 3.3 | 3.8 | +0.5 |
| Design-System and Styling Consistency | 3.5 | 4.3 | +0.8 |
| Shared Behavior, State, and Frontend Logic | 3.4 | 3.9 | +0.5 |
| Accessibility and Responsive Consistency | 3.2 | 4.0 | +0.8 |
| Validation, Testing, and Component Documentation | 3.2 | 3.7 | +0.5 |
| **Total** | **72** | **82** | **+10** |

All rating changes are within the ±1.5 guardrail and are explained by verified UI-026–UI-040 remediations on branch `cursor/frontend-architecture-remediation` (commits `5be4172`…`d551ab5`).

### Issues resolved since previous audit (verified in source)

| Issue | Verification |
| ----- | ------------ |
| UI-026 | Shared `useChatSendTurn`, `useChatEnqueueMessage`, `useChatSessionMutations`, `useChatSkillSelection`, `useChatQueuePresentation`, `chat-session-utils` wired by both chat hooks; residual adapter size tracked as UI-044 |
| UI-027 | `useListSelection` exists; SourcesColumn + ArtifactsColumn consume it; no duplicated Set selection state |
| UI-028 | `ModelSelector` supports default/clear/compact/required; ChatModelOverrideDialog + DefaultModelSelectors use it |
| UI-029 | `PickerDialogShell` + TemplatePicker/SkillPicker migrated; ToolPicker residual → UI-041 |
| UI-031 | Zero production `text-red-*` / `bg-red-*` / `border-red-*` |
| UI-032 | `PageError`/`InlineError` used by sources/page, LoginForm, ChatColumn |
| UI-033 | `PageRefreshButton showLabel` used by EpisodesTab and tools/[id] |
| UI-034 | `api-keys/page.tsx` = 128 lines; settings components extracted |
| UI-035 | No `window.confirm`; skills ConfirmDialog; CollapsibleColumn i18n; most icon labels; CredentialItem residual → UI-048 |
| UI-036 | `SourceDetailContent` uses `useSource` |
| UI-037 | `ChatPanelMessages` uses `EmptyState variant="subtle"` |
| UI-038 | AppSidebar + ProjectArtifactsNav use `Button asChild` + `aria-current` |
| UI-039 | CompactListRow adopted by ProjectCard, ProjectRow, SkillCard, McpConnectionCard, templates |
| UI-040 | FormDialogShell on templates/images/documents rename; PodcastProfileFormDialogShell wraps it |

### Intentional exceptions (unchanged)

- `ProjectDeleteDialog` / `EmbeddingModelChangeDialog` — complex multi-option confirms
- `SourceCard` / `EpisodeCard` / `GeneratePodcastDialog` — domain-specific complexity (not generic card DRY targets)
- images grid cards — intentional non–CompactListRow layout
- skills `beforeunload` — acceptable browser tab-close guard

---

## Audit coverage

**Inspected:**
- Prior open issues UI-026–UI-040 re-verified against remediated source
- Dashboard pages under `frontend/src/app/(dashboard)/`
- Shared foundations: `components/common/*`, `components/ui/*`, `components/layout/*`, `components/settings/*`
- Feature areas: projects columns, sources/chat, podcasts, skills, tools, templates, images, settings, mcp, search
- Chat hook stack and new shared helpers
- Test inventory (35 `*.test.ts(x)` files)

**Limited / not deeply inspected:**
- Full `lib/a2ui` catalog renderer internals
- Knowledge-graph Unity/canvas controls
- Share-route edge cases beyond ChatPanel reuse
- Exhaustive per-locale translation completeness
- Visual/Storybook inventory (none present)
- Line-by-line a11y inside SourceCard/ArtifactsColumn monoliths

**Coverage estimate:** 91%. Label: **High coverage**. Result is **not provisional**.

---

## Issue table

| Order | Issue ID | Severity | Confidence | Effort | Component or Pattern | Locations | Scoring Categories | Recommended Action |
| ----- | -------- | -------- | ---------- | ------ | -------------------- | --------- | ------------------ | ------------------ |
| 1 | UI-041 | Medium | High | Medium | ToolPicker shell residual | ToolPicker.tsx | Reuse, Duplication | Migrate to PickerDialogShell |
| 2 | UI-042 | Medium | High | Medium | Selectable row UX twins | SourceCard, ArtifactListRow | Duplication, Behavior, A11y | Extract useSelectableRow / shared classes |
| 3 | UI-045 | Medium | High | Small | Artifacts rename dialog | ArtifactsColumn.tsx | Reuse, Duplication | Use FormDialogShell |
| 4 | UI-043 | Medium | High | Medium | ChatPanel prop wiring | ChatColumn, sources/[id], share chat | Duplication, Composition | ConnectedChatPanel / bind helpers |
| 5 | UI-044 | Medium | High | Large | Chat adapter residual | useProjectChat, useSourceChat | Duplication, Behavior, Composition | Further thin via useChatRuntime factory |
| 6 | UI-047 | Medium | High | Medium | Missing foundation tests | PickerDialogShell, FormDialogShell, useChatSendTurn | Testing | Add unit tests |
| 7 | UI-046 | Low | High | Small | CheckboxList underuse / EN default | checkbox-list, ProjectAssociations, SkillPicker body | Reuse, i18n | Extend CheckboxList / require emptyMessage |
| 8 | UI-048 | Low | High | Small | CredentialItem title-only icons | CredentialItem.tsx | A11y | Add aria-label alongside title |

---

# UI-041: ToolPicker still bypasses PickerDialogShell

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Extends UI-029 `PickerDialogShell`
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations

## Problem

SkillPicker and TemplatePicker share `PickerDialogShell` + `usePickerDialogDraft`, but ToolPicker still rebuilds Dialog trigger/content/footer chrome. Domain grouping and risk badges are intentional; the shell/draft/footer duplication is accidental and causes UX drift (footer button variants already differ).

## Current state

- Shared: `frontend/src/components/common/PickerDialogShell.tsx`
- Migrated: `frontend/src/components/skills/SkillPicker.tsx`, `frontend/src/components/templates/TemplatePicker.tsx`
- Bypass: `frontend/src/components/mcp/ToolPicker.tsx` lines 96–214 — raw `Dialog`/`DialogContent`/`DialogFooter`; uses `PickerDialogSkeleton` + `EmptyState variant="subtle"` only
- Domain specifics to preserve: tool grouping by connection, risk badges, selected chip strip

## Goal state

- ToolPicker composes `PickerDialogShell` + `usePickerDialogDraft` + `PickerDialogActions`
- Grouped list and chips stay in body/`afterBody` slots
- Footer sizing/variants match Skill/Template pickers unless intentionally different and documented
- Verify open-reset, save/cancel, aria-label on trigger

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ToolPicker still uses a hand-rolled Dialog scaffold after SkillPicker and TemplatePicker migrated to PickerDialogShell.

Files:
- frontend/src/components/mcp/ToolPicker.tsx
- frontend/src/components/common/PickerDialogShell.tsx
- Reference: frontend/src/components/skills/SkillPicker.tsx

Architecture:
- Migrate ToolPicker to PickerDialogShell + usePickerDialogDraft + PickerDialogActions.
- Keep grouping, risk badges, and selected-chip UI in body/afterBody composition slots.
- Prefer composition over boolean props.
- Preserve aria-labels, i18n, loading skeleton, EmptyState subtle.
- Add or extend a small unit test for draft reset on open if practical.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- ToolPicker no longer defines its own Dialog chrome.
- Grouped tool selection UX preserved.
- Footer/trigger behavior aligned with other pickers.
```

---

# UI-042: Selectable row UX duplicated between SourceCard and ArtifactListRow

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Builds on `useListSelection` (UI-027) and `useLongPress`
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Behavior, State, and Frontend Logic; Accessibility and Responsive Consistency

## Problem

Column-level selection state is shared, but row-level long-press / click-to-toggle / selected styling / keyboard activation / checkbox-in-selection-mode patterns are still copy-pasted between `SourceCard` and inline `ArtifactListRow`. Interaction bugs must be fixed twice.

## Current state

- `frontend/src/components/sources/SourceCard.tsx` — long-press + selection click (~353–373), selected classes (~536–546), checkbox (~577–584)
- `frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx` — `ArtifactListRow` (~632–711) duplicates the same interaction
- Shared already: `useListSelection`, `useLongPress`, `ListSelectionBar`
- Domain UI that must remain separate: SourceCard pipeline/processing; ArtifactListRow drag/export

## Goal state

- `useSelectableRow` (and/or exported `selectableRowClassName`) owns long-press enter, click toggle, keyboard activation, `aria-pressed`, selected visual classes
- Both SourceCard and ArtifactListRow consume it
- Domain rendering stays feature-specific
- Verify selection enter/toggle/keyboard parity on both columns

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SourceCard and ArtifactListRow duplicate selectable-row interaction (long-press, click toggle, aria-pressed, selected ring/classes) after column selection state was centralized in useListSelection.

Files:
- frontend/src/components/sources/SourceCard.tsx (~353–584)
- frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx (ArtifactListRow ~632–711)
- frontend/src/lib/hooks/use-long-press.ts
- frontend/src/lib/hooks/useListSelection.ts

Architecture:
- Extract useSelectableRow (and optional selectableRowClassName) under lib/hooks or components/common.
- Migrate SourceCard and ArtifactListRow; leave pipeline/drag/export domain UI local.
- Preserve accessibility (aria-pressed, Enter/Space) and suppress-click-after-long-press behavior.
- Add unit tests for the helper.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Selection interaction logic exists once.
- Sources and artifacts row selection UX unchanged.
```

---

# UI-045: ArtifactsColumn rename dialog bypasses FormDialogShell

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Extends UI-040 `FormDialogShell`
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations

## Problem

templates/images/documents rename flows use `FormDialogShell`, but ArtifactsColumn still implements an inline rename Dialog with divergent spacing and footer handling.

## Current state

- Shared: `frontend/src/components/common/FormDialogShell.tsx`
- Bypass: `frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx` lines 512–557 — raw `Dialog` + `space-y-4` form
- Good adopters: `templates/page.tsx`, `images/page.tsx`, `documents/[id]/page.tsx`

## Goal state

- Artifacts rename uses `FormDialogShell` with `compactFooter` (or equivalent)
- Preserve rename validation, submit, and cancel/clear-on-close behavior

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ArtifactsColumn rename dialog still uses raw Dialog chrome after FormDialogShell was adopted for templates/images/documents rename flows.

Files:
- frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx (~512–557)
- frontend/src/components/common/FormDialogShell.tsx
- Reference: frontend/src/app/(dashboard)/templates/page.tsx rename dialog

Architecture:
- Replace the artifacts rename Dialog with FormDialogShell.
- Preserve title field, submit/cancel, and open/close reset behavior.
- Reuse existing dialog class tokens / compactFooter.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Artifacts rename uses FormDialogShell.
- Rename behavior unchanged.
```

---

# UI-043: ChatPanel prop wiring duplicated across chat surfaces

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Complements UI-044; safe to do before or after further hook thinning
**Scoring categories affected:** Duplication and One-Off Implementations; Composition and Component API Quality

## Problem

Project `ChatColumn`, source detail page, and share chat page each manually map ~20 ChatPanel props from hook return values. New ChatPanel props require multi-site updates; model-override wiring already diverges between project and source.

## Current state

- `frontend/src/app/(dashboard)/projects/components/ChatColumn.tsx` ~126–170
- `frontend/src/app/(dashboard)/sources/[id]/page.tsx` ~57–95
- `frontend/src/app/(share)/share/projects/[id]/chat/page.tsx` ~105–124 (subset)
- Shared UI: `frontend/src/components/source/ChatPanel.tsx`

## Goal state

- `bindProjectChatPanelProps` / `bindSourceChatPanelProps` helpers or thin `ConnectedChatPanel` wrappers accept hook results + overrides
- Call sites become short compositions
- Preserve project-only vs source-only props (context stats, abort, A2UI, shared mode)

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ChatColumn, sources/[id]/page, and share chat page duplicate long ChatPanel prop wiring from chat hooks.

Files:
- frontend/src/app/(dashboard)/projects/components/ChatColumn.tsx
- frontend/src/app/(dashboard)/sources/[id]/page.tsx
- frontend/src/app/(share)/share/projects/[id]/chat/page.tsx
- frontend/src/components/source/ChatPanel.tsx
- frontend/src/lib/hooks/useProjectChat.ts
- frontend/src/lib/hooks/useSourceChat.ts

Architecture:
- Extract bind helpers or ConnectedChatPanel wrappers that map hook results to ChatPanel props with typed overrides.
- Prefer composition; avoid a mega boolean options object.
- Preserve project/source/share behavioral differences.
- Update tests (ChatColumn/ChatPanel) as needed.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- ChatPanel prop mapping is centralized per context type.
- Project, source, and share chat UIs behave as before.
```

---

# UI-044: Chat domain hooks remain large orchestration adapters

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Large
**Dependencies:** Builds on UI-026 shared runtime; pairs with UI-043
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Behavior, State, and Frontend Logic; Composition and Component API Quality

## Problem

UI-026 extracted shared send/enqueue/session/skill/queue helpers, but `useProjectChat` (606 lines) and `useSourceChat` (399 lines) still contain parallel `ensureSession`, payload builders, and return-shape assembly. Domain extras (A2UI, sharedMode, abort, context indicators) are legitimate; orchestration boilerplate is not.

## Current state

- Shared helpers under `frontend/src/lib/hooks/`: `useChatSendTurn.ts`, `useChatEnqueueMessage.ts`, `useChatSessionMutations.ts`, `useChatSkillSelection.ts`, `useChatQueuePresentation.ts`, `chat-session-utils.ts`
- Adapters: `useProjectChat.ts` (606), `useSourceChat.ts` (399)
- Parallel blocks: ensureSession, buildSendRequest, buildEnqueuePayload, createSession wrappers

## Goal state

- Optional `useChatRuntime({ api, scope, builders, plugins })` further reduces adapters toward thin wrappers (~150–250 LOC)
- Domain plugins own A2UI / abort / sharedMode / context indicators
- Public return shapes for ChatPanel consumers preserved (or migrated via UI-043)

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
After UI-026 extracted shared chat helpers, useProjectChat (~606) and useSourceChat (~399) still duplicate ensureSession/payload/return orchestration.

Files:
- frontend/src/lib/hooks/useProjectChat.ts
- frontend/src/lib/hooks/useSourceChat.ts
- Existing shared helpers: useChatSendTurn, useChatEnqueueMessage, useChatSessionMutations, useChatSkillSelection, useChatQueuePresentation, chat-session-utils

Architecture:
- Extract a parameterized useChatRuntime (or equivalent) for shared orchestration.
- Keep project/source-only behavior as injected plugins/options.
- Preserve ChatPanel-facing return contracts unless UI-043 migrates call sites in the same change.
- Prefer composition over boolean sprawl.
- Extend unit tests; keep ChatPanel/queue tests green.
- Run typecheck/lint/relevant vitest suites.
- Summarize files changed and verification completed.

Acceptance criteria:
- Domain hooks shrink substantially and stop duplicating ensureSession/payload wiring.
- Project and source chat still stream, enqueue, persist selections, and handle errors.
```

---

# UI-047: Missing unit tests for new shared shells and send-turn hook

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (protects UI-029/UI-040/UI-026 foundations)
**Scoring categories affected:** Validation, Testing, and Component Documentation

## Problem

Remediation introduced cross-feature foundations without matching tests: `PickerDialogShell`, `FormDialogShell`, and `useChatSendTurn` lack dedicated unit tests. Regressions would spread widely.

## Current state

- Untested: `frontend/src/components/common/PickerDialogShell.tsx`, `FormDialogShell.tsx`, `frontend/src/lib/hooks/useChatSendTurn.ts`
- Tested peers: `CompactListRow.test.tsx`, `ModelSelector.test.tsx`, `PageError.test.tsx`, `useListSelection.test.ts`, `chat-session-utils.test.ts`, `useChatQueuePresentation.test.ts`
- Test inventory: 35 files under `frontend/src` (improved from ~12)

## Goal state

- Focused unit tests covering draft reset on open, save/cancel, FormDialogShell submit/disable, useChatSendTurn optimistic insert + error rollback
- No Storybook required for this issue (optional follow-up)

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
PickerDialogShell, FormDialogShell, and useChatSendTurn are shared foundations without dedicated unit tests.

Files:
- frontend/src/components/common/PickerDialogShell.tsx
- frontend/src/components/common/FormDialogShell.tsx
- frontend/src/lib/hooks/useChatSendTurn.ts
- Reference test patterns: CompactListRow.test.tsx, useListSelection.test.ts, PageError.test.tsx

Architecture:
- Add focused unit/interaction tests for draft sync, cancel/save, form submit/disable, and send-turn optimistic/error paths.
- Prefer existing vitest + testing-library patterns.
- Do not add Storybook in this change unless already present.
- Run the new tests and related suites.
- Summarize files changed and verification completed.

Acceptance criteria:
- Each listed foundation has meaningful unit coverage.
- Tests fail if draft-reset or optimistic rollback regresses.
```

---

# UI-046: CheckboxList underused and default empty message hardcoded English

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Shared Component Reuse; Design-System and Styling Consistency (i18n)

## Problem

`CheckboxList` exists but is only used by ProjectsStep and SaveToProjectsDialog. ProjectAssociations (and picker bodies) reimplement similar checkbox rows. The component also defaults `emptyMessage` to hardcoded English `"No items found."`.

## Current state

- Shared: `frontend/src/components/ui/checkbox-list.tsx` (default empty at L26)
- Consumers: `ProjectsStep.tsx`, `SaveToProjectsDialog.tsx`
- Ad-hoc: `ProjectAssociations.tsx` ~120–157; SkillPicker body rows (domain-adjacent)
- Not a fit: `AddExistingSourceDialog` richer rows (icons/badges/dates) — leave alone

## Goal state

- Require translated `emptyMessage` (or remove English default)
- Optionally extend CheckboxList with a plain variant for ProjectAssociations
- Do not force SkillPicker into CheckboxList if divide-y picker layout differs meaningfully

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
CheckboxList has a hardcoded English empty default and is underused vs ProjectAssociations ad-hoc checkbox rows.

Files:
- frontend/src/components/ui/checkbox-list.tsx
- frontend/src/components/source/ProjectAssociations.tsx
- Callers: ProjectsStep.tsx, SaveToProjectsDialog.tsx

Architecture:
- Remove or require emptyMessage (no English default).
- Migrate ProjectAssociations to CheckboxList if row shape fits, or extract a shared CheckboxListRow.
- Leave AddExistingSourceDialog alone if still too domain-specific.
- Preserve a11y labels and selection behavior.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- No hardcoded English empty default.
- ProjectAssociations reuses shared checkbox list primitives where practical.
```

---

# UI-048: CredentialItem icon buttons use title without aria-label

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Residual of UI-035
**Scoring categories affected:** Accessibility and Responsive Consistency

## Problem

Most UI-035 icon-label work landed, but CredentialItem Test/Models/Edit/Delete icon buttons still expose accessible names only via `title`, while the delete-model button correctly uses `aria-label`. Screen readers inconsistently treat `title` as an accessible name.

## Current state

- `frontend/src/components/settings/CredentialItem.tsx` ~115–136 — `title={...}` only on Test/Sync/Edit/Delete
- Contrast: L192 delete-model button has both `title` and `aria-label`
- Positive: SourcesTableRow, ProfileCardActions, CollapsibleColumn already remediated

## Goal state

- Icon-only CredentialItem actions include `aria-label` (i18n), optionally keeping `title` for hover
- Verify with existing a11y patterns from SourcesTableRow

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
CredentialItem icon-only buttons rely on title without aria-label after UI-035 remediation elsewhere.

Files:
- frontend/src/components/settings/CredentialItem.tsx (~115–136, compare L192)

Architecture:
- Add aria-label (i18n) to Test, Sync/Models, Edit, and Delete icon buttons.
- Keep title if useful for hover tooltips.
- Preserve disabled/decryption-error behavior.
- Run typecheck/lint; add a small test if practical.
- Summarize files changed and verification completed.

Acceptance criteria:
- All CredentialItem icon-only actions expose aria-label.
- No behavior regressions.
```

---

## Final Assessment

### Recommended implementation order

1. **UI-041** ToolPicker → PickerDialogShell
2. **UI-045** Artifacts rename → FormDialogShell
3. **UI-042** Selectable row interaction helper
4. **UI-043** ChatPanel bind helpers / ConnectedChatPanel
5. **UI-044** Further chat runtime thinning (after or with UI-043)
6. **UI-047** Foundation tests for shells + useChatSendTurn
7. **UI-046** CheckboxList emptyMessage + ProjectAssociations
8. **UI-048** CredentialItem aria-labels

### Shared components / hooks that should become frontend standards

- Existing: ConfirmDialog, EmptyState, PageHeader, PageRefreshButton, PageError, ListSelectionBar, LoadingSkeletons, FormDialogShell, PickerDialogShell, CompactListRow, ModelSelector, useListSelection, chat send/enqueue/session helpers
- Emerging: useSelectableRow, ConnectedChatPanel / bind helpers, useChatRuntime

### Existing patterns that should be deprecated after migration

- ToolPicker raw Dialog chrome (after UI-041)
- ArtifactsColumn inline rename Dialog (after UI-045)
- Duplicated selectable-row interaction in SourceCard/ArtifactListRow (after UI-042)
- Manual ChatPanel prop maps (after UI-043)
- CredentialItem title-only icon naming (after UI-048)

### Areas inspected and found consistent

- ConfirmDialog adoption for simple deletes; no `window.confirm`
- Destructive design tokens (no production hardcoded red utilities)
- CompactListRow on manage-list cards
- FormDialogShell on templates/images/documents (+ podcast shell wrap)
- PickerDialogShell on Skill/Template pickers
- useListSelection on project columns
- Extended ModelSelector for override + defaults
- PageError/InlineError on specified call sites
- Sidebar nav a11y (`asChild` + `aria-current`)
- api-keys page composition (128 lines)
- SourceDetailContent → useSource
- Chat EmptyState subtle + labeled PageRefreshButton

### Areas that could not be inspected (or only shallowly)

- Full A2UI catalog matrix
- Knowledge-graph Unity internals
- Exhaustive locale completeness / visual QA
- Storybook (not present)
- Exhaustive a11y inside SourceCard/ArtifactsColumn monoliths

### Categories preventing a higher score

- **Composition (3.8):** SourceCard/ArtifactsColumn monoliths; chat adapters still large
- **Duplication (4.0):** ToolPicker, selectable rows, ChatPanel wiring
- **Shared Behavior (3.9):** residual chat orchestration
- **Testing (3.7):** untested new shells/send-turn; no Storybook

### Changes most likely to improve the score

1. UI-041 + UI-045 (finish shell adoption)
2. UI-042 + UI-043 (remove remaining twins)
3. UI-047 (protect foundations with tests)
4. UI-044 (further chat thinning)

### Overall frontend component architecture assessment

The frontend is **improving** and now scores **82/100**. The High-severity clusters that capped the 72 scorecard (list selection twins, chat send duplication, api-keys monolith) are resolved or substantially reduced. Shared prefab-style foundations (`FormDialogShell`, `PickerDialogShell`, `CompactListRow`, `useListSelection`, extended `ModelSelector`, chat send helpers, PageError) are real and adopted. Remaining debt is Medium/Low and localized — finishing ToolPicker/FormDialogShell residuals, selectable-row interaction, ChatPanel binding helpers, and foundation tests are the clearest path toward the high-80s.

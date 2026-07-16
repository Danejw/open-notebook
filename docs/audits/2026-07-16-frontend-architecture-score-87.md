# Frontend Architecture Score: 87/100

**Previous score:** 82/100 (2026-07-16 post-remediation audit — pre UI-041–UI-048)
**Change:** +5
**Audit coverage:** 93% — High coverage
**Comparison status:** Directly comparable — same scoring rubric, similar High coverage (91% → 93%), and prior open issues UI-041–UI-048 were re-verified against current remediated source
**Architecture trend:** Improving

**Issues found:** 11 open (High: 0, Medium: 6, Low: 5); 8 prior issues resolved (UI-041–UI-048)
**Most repeated frontend pattern:** Remaining form/picker dialog chrome bypasses (`AddExistingSourceDialog`, skills file dialogs, AdvancedModels/ChatModelOverride) + PageError under-adoption
**Highest-value refactor:** Finish picker/form shell adoption (AddExistingSourceDialog + FormDialogShell residuals), then extract picker checkbox-row primitive

---

## Scorecard

| Scoring Category                                 |  Weight | Rating |   Points Earned | Evidence Summary |
| ------------------------------------------------ | ------: | -----: | --------------: | ---------------- |
| Shared Component Reuse                           |      25 |    4.7 |            23.5 | All 3 pickers on PickerDialogShell; rename dialogs on FormDialogShell incl. Artifacts; CheckboxList requires i18n emptyMessage; AddExistingSourceDialog + some form dialogs still bypass shells |
| Duplication and One-Off Implementations          |      20 |    4.3 |            17.2 | Selectable-row, ChatPanel wiring, ToolPicker chrome twins closed; residual picker-row markup, MCP auth fields, form-dialog chrome |
| Composition and Component API Quality            |      15 |    4.0 |            12.0 | useChatRuntime + bindChatPanelProps; useSourceChat 226 LOC; useProjectChat still 438; SourceCard 836 / ArtifactsColumn 787 remain large |
| Design-System and Styling Consistency            |      15 |    4.3 |            12.9 | Zero production hardcoded reds; destructive tokens retained; blue/green status utilities still used outside domain cards |
| Shared Behavior, State, and Frontend Logic       |      10 |    4.2 |             8.4 | useChatRuntime factory, useSelectableRow, bind helpers; project chat A2UI/sharedMode still in adapter |
| Accessibility and Responsive Consistency         |      10 |    4.2 |             8.4 | CredentialItem icon aria-labels; selectable-row role/keyboard centralized; residual model-test title-only + English visible labels |
| Validation, Testing, and Component Documentation |       5 |    4.1 |             4.1 | 41 test files / 269 tests; shells + useChatSendTurn + useSelectableRow + bindChatPanelProps + useChatRuntime covered; no Storybook; ListSelectionBar untested |
| **Total**                                        | **100** |        |       **87/100** |                  |

### Category rating notes

1. **Shared Component Reuse (4.7):** Completing ToolPicker shell adoption and Artifacts FormDialogShell removes the prior Medium reuse caps. Residual bypasses (AddExistingSourceDialog, skills rename, AdvancedModels/ChatModelOverride) keep this below 4.9. No unresolved High on foundational shared components.
2. **Duplication (4.3):** The three Medium twins from the 82 scorecard (ToolPicker chrome, selectable rows, ChatPanel wiring) are verified closed. Remaining duplication is localized.
3. **Composition (4.0):** useChatRuntime + bind helpers are affirmative composition wins; feature monoliths and a still-large project chat adapter prevent a higher rating.
4. **Design-System (4.3):** Unchanged — no design-token work in UI-041–048; prior destructive-token evidence still holds.
5. **Shared Behavior (4.2):** useChatRuntime is the largest behavioral consolidation since UI-026; adapters thinner but project chat remains non-trivial.
6. **A11y (4.2):** UI-048 CredentialItem labels + UI-042 row a11y centralization; Low residual in CredentialItem nested model test button.
7. **Testing (4.1):** Explicit prior gap (shells / useChatSendTurn untested) closed; inventory 35→41 files. No Storybook keeps this below 4.5.

### Historical comparison (category ratings)

| Category | Previous (82) | Current | Δ |
| -------- | ------------: | ------: | -: |
| Shared Component Reuse | 4.5 | 4.7 | +0.2 |
| Duplication and One-Off Implementations | 4.0 | 4.3 | +0.3 |
| Composition and Component API Quality | 3.8 | 4.0 | +0.2 |
| Design-System and Styling Consistency | 4.3 | 4.3 | 0 |
| Shared Behavior, State, and Frontend Logic | 3.9 | 4.2 | +0.3 |
| Accessibility and Responsive Consistency | 4.0 | 4.2 | +0.2 |
| Validation, Testing, and Component Documentation | 3.7 | 4.1 | +0.4 |
| **Total** | **82** | **87** | **+5** |

All rating changes are within the ±1.5 guardrail and are explained by verified UI-041–UI-048 remediations on branch `cursor/frontend-architecture-remediation` (commits `fa7336c`…`0029ac8`).

### Issues resolved since previous audit (verified in source)

| Issue | Verification |
| ----- | ------------ |
| UI-041 | `ToolPicker.tsx` uses `PickerDialogShell`, `usePickerDialogDraft`, `PickerDialogActions` (L11–14, L87–211) |
| UI-042 | `useSelectableRow.ts` consumed by `SourceCard.tsx` and `ArtifactsColumn.tsx` ArtifactListRow; tests present |
| UI-043 | `bindChatPanelProps.ts` used by ChatColumn, sources/[id], share chat; tests present |
| UI-044 | `useChatRuntime.ts` (513 LOC); `useProjectChat` 438, `useSourceChat` 226 |
| UI-045 | `ArtifactsColumn.tsx` rename uses `FormDialogShell` (L513–541) |
| UI-046 | `CheckboxList` requires `emptyMessage`; ProjectAssociations migrated |
| UI-047 | Tests for PickerDialogShell (6), FormDialogShell (6), useChatSendTurn (5) |
| UI-048 | CredentialItem Test/Sync/Edit/Delete have `aria-label` (L116–146) |

### Intentional exceptions (unchanged)

- `ProjectDeleteDialog` / `EmbeddingModelChangeDialog` — complex multi-option confirms
- `SourceCard` / `EpisodeCard` / `GeneratePodcastDialog` — domain-specific complexity
- `SourceCard` pipeline blue/green status map — intentional stage semantics
- Artifact full-screen viewer Dialog — domain viewer, not a rename/form twin
- images grid cards — intentional non–CompactListRow layout

---

## Audit coverage

**Inspected:**
- Prior open issues UI-041–UI-048 re-verified
- Prior resolved UI-026–UI-040 spot-checked still present
- Shared foundations: common/, ui/, layout/, settings/
- Feature areas: projects columns, sources/chat, podcasts, skills, tools, templates, images, mcp, search
- Chat hook stack (`useChatRuntime`, adapters, bind helpers)
- Test inventory (41 `*.test.ts(x)` files)

**Limited / not deeply inspected:**
- Full `lib/a2ui` catalog renderer internals
- Knowledge-graph Unity/canvas controls
- Exhaustive per-locale translation completeness
- Visual/Storybook inventory (none present)
- Line-by-line a11y inside SourceCard/ArtifactsColumn monoliths

**Coverage estimate:** 93%. Label: **High coverage**. Result is **not provisional**.

---

## Issue table

| Order | Issue ID | Severity | Confidence | Effort | Component or Pattern | Locations | Scoring Categories | Recommended Action |
| ----- | -------- | -------- | ---------- | ------ | -------------------- | --------- | ------------------ | ------------------ |
| 1 | UI-049 | Medium | High | Medium | AddExistingSourceDialog shell | AddExistingSourceDialog.tsx | Reuse, Duplication | Extend/migrate to PickerDialogShell |
| 2 | UI-050 | Medium | High | Medium | Picker checkbox row twins | SkillPicker, ToolPicker, AddExistingSourceDialog | Duplication, Reuse | Extract PickerCheckboxRow / use CheckboxList |
| 3 | UI-051 | Medium | High | Medium | FormDialogShell residuals | skills/[id], AdvancedModelsDialog, ChatModelOverrideDialog | Reuse, Duplication | Migrate to FormDialogShell |
| 4 | UI-052 | Medium | High | Small | MCP auth field twins | McpConnectionCreateDialog, tools/[id] | Duplication | Extract McpAuthFields |
| 5 | UI-053 | Medium | High | Small | PageError under-adoption | SourceDetailContent, share chat, SettingsForm, EpisodesTab | Reuse, Consistency | Adopt PageError/InlineError |
| 6 | UI-054 | Medium | High | Medium | ArtifactsColumn monolith | ArtifactsColumn.tsx | Composition | Extract ArtifactListRow + viewer dialog |
| 7 | UI-056 | Low | High | Small | bindChatPanelProps internal DRY | bindChatPanelProps.ts | Duplication | Extract bindCommonChatPanelProps |
| 8 | UI-055 | Low | High | Small | riskBadgeVariant twins | ToolPicker, tools/[id] | Duplication | Shared McpToolRiskBadge util |
| 9 | UI-059 | Low | High | Small | CredentialItem residual a11y/i18n | CredentialItem.tsx | A11y | aria-label on model test; i18n visible labels |
| 10 | UI-058 | Low | High | Small | Chat/project loading skeletons | ChatColumn, share chat, projects/[id] | Reuse | Shared ChatPanelSkeleton / DashboardContentSkeleton |
| 11 | UI-061 | Low | High | Small | ListSelectionBar untested | ListSelectionBar.tsx | Testing | Add unit tests |

---

# UI-049: AddExistingSourceDialog bypasses PickerDialogShell

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Extends UI-029/UI-041 `PickerDialogShell`
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations

## Problem

Skill/Template/Tool pickers share `PickerDialogShell`, but `AddExistingSourceDialog` still rebuilds Dialog chrome, loading/empty states, and footer actions with divergent empty UX.

## Current state

- Shared: `frontend/src/components/common/PickerDialogShell.tsx`
- Bypass: `frontend/src/components/sources/AddExistingSourceDialog.tsx` (~176–302) — raw `DialogContent`, custom empty (~213–217), custom checkbox list
- Domain specifics to preserve: search box, source type icons, linked badges, dates, large dialog width

## Goal state

- Dialog uses `PickerDialogShell` (extend with `beforeBody` search slot and/or larger content class if needed)
- Empty uses `EmptyState variant="subtle"`; loading uses `PickerDialogSkeleton`
- Selection list can share UI-050 row primitive
- Verify search, multi-select, add/cancel behavior

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
AddExistingSourceDialog still uses raw Dialog chrome after Skill/Template/Tool pickers migrated to PickerDialogShell.

Files:
- frontend/src/components/sources/AddExistingSourceDialog.tsx
- frontend/src/components/common/PickerDialogShell.tsx
- Reference: frontend/src/components/skills/SkillPicker.tsx

Architecture:
- Migrate to PickerDialogShell; extend shell with beforeBody/search slot and/or contentClassName for large dialogs if needed.
- Use EmptyState subtle + PickerDialogSkeleton.
- Preserve search, icons, linked badges, dates, multi-select, and add action.
- Prefer composition over boolean props.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- No hand-rolled Dialog chrome in AddExistingSourceDialog.
- Existing add-source UX preserved.
```

---

# UI-050: Picker multi-select checkbox row markup triplicated

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Complements UI-049; builds on CheckboxList (UI-046)
**Scoring categories affected:** Duplication and One-Off Implementations; Shared Component Reuse

## Problem

SkillPicker, ToolPicker, and AddExistingSourceDialog each hand-roll nearly identical checkbox+label+description rows. Conventions already drift (`<label>` vs `<div>`+`Label`).

## Current state

- `frontend/src/components/skills/SkillPicker.tsx` ~95–124
- `frontend/src/components/mcp/ToolPicker.tsx` ~150–208
- `frontend/src/components/sources/AddExistingSourceDialog.tsx` ~219–250
- Shared alternative: `frontend/src/components/ui/checkbox-list.tsx` (used by ProjectAssociations, ProjectsStep, SaveToProjectsDialog)

## Goal state

- Shared `PickerCheckboxRow` (or CheckboxList `variant="picker"`) used by all three
- Preserve risk badges / meta slots for ToolPicker and source icons for AddExisting
- SkillPicker preferably migrates onto CheckboxList/PickerCheckboxRow inside PickerDialogShell body

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
SkillPicker, ToolPicker, and AddExistingSourceDialog duplicate checkbox+label+description row markup.

Files:
- frontend/src/components/skills/SkillPicker.tsx
- frontend/src/components/mcp/ToolPicker.tsx
- frontend/src/components/sources/AddExistingSourceDialog.tsx
- frontend/src/components/ui/checkbox-list.tsx

Architecture:
- Extract PickerCheckboxRow or extend CheckboxList with a picker/plain variant and meta slot.
- Migrate the three list bodies; keep domain meta (risk badge, icons, dates) via slots.
- Preserve a11y (htmlFor/id, keyboard).
- Add a small unit test for the row primitive.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Checkbox row markup exists once.
- Selection UX and domain meta preserved.
```

---

# UI-051: FormDialogShell residuals in skills and model dialogs

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** Extends UI-040 `FormDialogShell`
**Scoring categories affected:** Shared Component Reuse; Duplication and One-Off Implementations

## Problem

Rename/edit flows on templates/images/documents/artifacts use `FormDialogShell`, but skills file create/rename, AdvancedModelsDialog, and ChatModelOverrideDialog still hand-roll Dialog+footer chrome with inconsistent footer sizing.

## Current state

- Shared: `frontend/src/components/common/FormDialogShell.tsx`
- Bypass:
  - `frontend/src/app/(dashboard)/skills/[id]/page.tsx` ~437–489 (create file + rename file)
  - `frontend/src/components/search/AdvancedModelsDialog.tsx` ~58–99
  - `frontend/src/components/source/ChatModelOverrideDialog.tsx` ~75–130 (needs footer-left reset slot)
- Good adopters: templates/images/documents/ArtifactsColumn rename, PodcastProfileFormDialogShell

## Goal state

- Single- and multi-field submit dialogs use FormDialogShell (`beforeForm`, `compactFooter`, footer-left for reset)
- ChatModelOverrideDialog keeps ModelSelector + reset-to-default action via composition
- Preserve validation and submit behavior

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
skills/[id] file dialogs, AdvancedModelsDialog, and ChatModelOverrideDialog still bypass FormDialogShell after rename flows were consolidated.

Files:
- frontend/src/app/(dashboard)/skills/[id]/page.tsx (~437–489)
- frontend/src/components/search/AdvancedModelsDialog.tsx
- frontend/src/components/source/ChatModelOverrideDialog.tsx
- frontend/src/components/common/FormDialogShell.tsx

Architecture:
- Migrate these dialogs onto FormDialogShell.
- Use beforeForm / compactFooter / custom footer-left as needed for reset actions.
- Preserve ModelSelector usage in ChatModelOverrideDialog and AdvancedModelsDialog.
- Prefer composition over boolean sprawl.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Listed dialogs use FormDialogShell.
- Existing save/cancel/reset behavior preserved.
```

---

# UI-052: MCP auth form fields duplicated

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None (optionally compose with FormDialogShell from UI-051)
**Scoring categories affected:** Duplication and One-Off Implementations

## Problem

Create-connection and replace-auth flows duplicate identical auth-type Select + conditional bearer Input blocks.

## Current state

- `frontend/src/app/(dashboard)/tools/components/McpConnectionCreateDialog.tsx` ~102–126
- `frontend/src/app/(dashboard)/tools/[id]/page.tsx` ~330–356

## Goal state

- Shared `McpAuthFields` component composed by both dialogs
- Preserve auth-type options, conditional bearer visibility, labels/placeholders

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
McpConnectionCreateDialog and tools/[id] replace-auth dialog duplicate auth-type Select + bearer Input fields.

Files:
- frontend/src/app/(dashboard)/tools/components/McpConnectionCreateDialog.tsx
- frontend/src/app/(dashboard)/tools/[id]/page.tsx
- Create: frontend/src/components/mcp/McpAuthFields.tsx (or tools/components/)

Architecture:
- Extract McpAuthFields with controlled authType/token values and onChange callbacks.
- Migrate both dialogs to compose it.
- Preserve i18n labels and validation behavior.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Auth field markup exists once.
- Create and replace-auth flows unchanged.
```

---

# UI-053: PageError / InlineError under-adopted on error surfaces

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Extends UI-032
**Scoring categories affected:** Shared Component Reuse; Design-System and Styling Consistency

## Problem

`PageError`/`InlineError` exist and are used on sources page, LoginForm, and ChatColumn, but several load/error surfaces still use one-off destructive text or Alerts with inconsistent roles and layout.

## Current state

- Shared: `frontend/src/components/common/PageError.tsx`
- Adopted: `sources/page.tsx`, `LoginForm.tsx`, `ChatColumn.tsx`
- Bypass examples:
  - `SourceDetailContent.tsx` ~256–263 — raw `text-destructive` paragraph
  - `share/projects/[id]/chat/page.tsx` ~78–83 — muted paragraph
  - `settings/components/SettingsForm.tsx` ~153–161 — Alert destructive
  - `podcasts/EpisodesTab.tsx` ~116–123 — Alert destructive
  - `projects/[id]/page.tsx` ~307–313 — custom not-found

## Goal state

- Full-panel failures use `PageError`; inline/form failures use `InlineError` (or Alert via a shared thin wrapper if Alert is preferred for forms)
- Consistent `role="alert"` / destructive tokens
- Preserve existing copy and retry/actions

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
PageError/InlineError are only partially adopted; several error surfaces still use one-off markup.

Files:
- frontend/src/components/common/PageError.tsx
- frontend/src/components/source/SourceDetailContent.tsx
- frontend/src/app/(share)/share/projects/[id]/chat/page.tsx
- frontend/src/app/(dashboard)/settings/components/SettingsForm.tsx
- frontend/src/components/podcasts/EpisodesTab.tsx
- frontend/src/app/(dashboard)/projects/[id]/page.tsx

Architecture:
- Migrate full-panel and inline error UIs to PageError/InlineError where they fit.
- Keep Alert only when form-field context truly requires it; otherwise prefer shared components.
- Preserve messages and actions.
- Extend PageError tests if new variants are needed.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Listed surfaces use shared error components.
- Messaging and actions preserved.
```

---

# UI-054: ArtifactsColumn remains an actionable monolith

**Severity:** Medium
**Confidence:** High
**Estimated effort:** Medium
**Dependencies:** None (rename and selection already extracted)
**Scoring categories affected:** Composition and Component API Quality

## Problem

Selection and rename dialogs were extracted, but `ArtifactsColumn` (~787 LOC) still co-locates `ArtifactListRow`, drag/export/context controls, and a full-screen viewer Dialog — harder to test and parallel than the SourceCard split pattern.

## Current state

- `frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx` (~787 LOC)
- Inline `ArtifactListRow` ~568–787
- Inline viewer Dialog ~427–511
- Already shared: `useListSelection`, `useSelectableRow`, `FormDialogShell` rename, `ListSelectionBar`

## Goal state

- `ArtifactListRow.tsx` and `ArtifactViewerDialog.tsx` extracted under projects/components or components/projects
- Column remains orchestration (data, selection, bulk actions)
- Preserve drag/export/context/viewer behavior and a11y

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ArtifactsColumn still co-locates ArtifactListRow and a full-screen viewer Dialog after selection/rename extractions.

Files:
- frontend/src/app/(dashboard)/projects/components/ArtifactsColumn.tsx
- Create: ArtifactListRow.tsx and ArtifactViewerDialog.tsx nearby

Architecture:
- Extract row and viewer into focused components; keep column as orchestration.
- Preserve useSelectableRow, drag/export menus, context toggles, and viewer controls.
- Prefer composition; avoid prop explosion (group related callbacks).
- Add focused tests for extracted pieces if practical.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- ArtifactsColumn is primarily orchestration.
- Row and viewer behavior unchanged.
```

---

# UI-056: bindChatPanelProps still duplicates queue/session mapping

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Extends UI-043
**Scoring categories affected:** Duplication and One-Off Implementations

## Problem

UI-043 removed call-site wiring twins, but `bindProjectChatPanelProps` and `bindSourceChatPanelProps` still repeat queue handlers, skill/template/MCP fields, and session CRUD mapping inside the bind module.

## Current state

- `frontend/src/components/source/bindChatPanelProps.ts` — project binder ~27–54 vs source binder ~97–123 largely parallel
- Tests: `bindChatPanelProps.test.ts`

## Goal state

- `bindCommonChatPanelProps(runtimeSlice)` returns shared fields; project/source binders add only context-specific overrides
- Tests updated accordingly

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
bindProjectChatPanelProps and bindSourceChatPanelProps still duplicate queue/session/skill mapping internally.

Files:
- frontend/src/components/source/bindChatPanelProps.ts
- frontend/src/components/source/bindChatPanelProps.test.ts

Architecture:
- Extract bindCommonChatPanelProps for shared fields.
- Keep project/source/shared binders as thin wrappers with overrides.
- Update unit tests.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Shared mapping exists once.
- All ChatPanel consumers still receive correct props.
```

---

# UI-055: riskBadgeVariant duplicated in MCP tool UIs

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** None
**Scoring categories affected:** Duplication and One-Off Implementations

## Problem

Identical risk-level → Badge variant switch appears in ToolPicker and tools detail page.

## Current state

- `frontend/src/components/mcp/ToolPicker.tsx` ~31–44
- `frontend/src/app/(dashboard)/tools/[id]/page.tsx` ~41–54

## Goal state

- Shared util or `McpToolRiskBadge` component
- Both surfaces consume it

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
riskBadgeVariant (or equivalent risk→Badge mapping) is duplicated in ToolPicker and tools/[id].

Files:
- frontend/src/components/mcp/ToolPicker.tsx
- frontend/src/app/(dashboard)/tools/[id]/page.tsx
- Create shared util/component under components/mcp/ or lib/utils/

Architecture:
- Extract shared mapping/component; migrate both call sites.
- Preserve badge variants and labels.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Risk badge mapping exists once.
- Visual behavior unchanged.
```

---

# UI-059: CredentialItem residual a11y and English labels

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Residual of UI-048
**Scoring categories affected:** Accessibility and Responsive Consistency

## Problem

Header icon buttons have aria-labels, but the nested model test button still uses `title` only (delete has aria-label). Visible "Test"/"Models" strings and some TYPE_LABELS remain hardcoded English.

## Current state

- `frontend/src/components/settings/CredentialItem.tsx` — model test ~187–197 title-only; visible Test/Models ~119, ~129
- `frontend/src/components/settings/apiKeysShared.tsx` ~91–96 TYPE_LABELS English

## Goal state

- Model test button has `aria-label`
- Visible labels routed through i18n
- Preserve existing behavior

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
CredentialItem nested model test button lacks aria-label; some visible English labels remain after UI-048.

Files:
- frontend/src/components/settings/CredentialItem.tsx
- frontend/src/components/settings/apiKeysShared.tsx
- Locale files under frontend/src/lib/locales/ (add keys; do not rename unrelated keys)

Architecture:
- Add aria-label on model test button; i18n visible Test/Models and TYPE_LABELS.
- Preserve title tooltips if useful.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Model test control has aria-label.
- Listed visible strings are translated.
```

---

# UI-058: Chat and project detail loading skeletons bypass shared presets

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Extends LoadingSkeletons family
**Scoring categories affected:** Shared Component Reuse

## Problem

Most list pages use `LoadingSkeletons` / `DashboardContentSkeleton`, but ChatColumn, share chat, and projects/[id] still use bespoke Skeleton/`animate-pulse` blocks.

## Current state

- Shared: `frontend/src/components/common/LoadingSkeletons.tsx`, `DashboardContentSkeleton`
- Bypass: `ChatColumn.tsx` ~102–110; `share/projects/[id]/chat/page.tsx` ~86–100; `projects/[id]/page.tsx` ~286–303
- Contrast: `projects/[id]/loading.tsx` already uses `DashboardContentSkeleton`

## Goal state

- Shared `ChatPanelSkeleton` (or reuse existing presets) on chat surfaces
- Project detail page uses shared projectDetail skeleton consistently
- Preserve layout density

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ChatColumn, share chat, and projects/[id] use bespoke loading skeletons instead of shared LoadingSkeletons/DashboardContentSkeleton presets.

Files:
- frontend/src/app/(dashboard)/projects/components/ChatColumn.tsx
- frontend/src/app/(share)/share/projects/[id]/chat/page.tsx
- frontend/src/app/(dashboard)/projects/[id]/page.tsx
- frontend/src/components/common/LoadingSkeletons.tsx
- frontend/src/components/layout/DashboardContentSkeleton.tsx

Architecture:
- Add or reuse shared skeleton presets; migrate the three surfaces.
- Preserve layout structure and accessibility of loading regions.
- Extend LoadingSkeletons tests if adding a new preset.
- Run typecheck/lint/relevant tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Listed surfaces use shared skeleton presets.
- Loading layout remains appropriate.
```

---

# UI-061: ListSelectionBar lacks unit tests

**Severity:** Low
**Confidence:** High
**Estimated effort:** Small
**Dependencies:** Complements tested `useListSelection`
**Scoring categories affected:** Validation, Testing, and Component Documentation

## Problem

`ListSelectionBar` is shared bulk-action chrome used by both project columns but has no dedicated unit tests, unlike peer foundations.

## Current state

- `frontend/src/components/common/ListSelectionBar.tsx` — no `*.test.*`
- Consumers: `SourcesColumn.tsx`, `ArtifactsColumn.tsx`
- Related tested: `useListSelection.test.ts`

## Goal state

- `ListSelectionBar.test.tsx` covers toolbar role, clear aria-label, optional select-all, children actions slot

## Prompt to fix it

```text
Inspect the Construction OS frontend before editing. Do not change unrelated files.

Problem:
ListSelectionBar is a shared foundation without unit tests.

Files:
- frontend/src/components/common/ListSelectionBar.tsx
- Create: frontend/src/components/common/ListSelectionBar.test.tsx
- Reference: EmptyState.test.tsx, PageHeader.test.tsx

Architecture:
- Add focused tests for role="toolbar", clear control accessible name, select-all, and action children.
- Prefer existing vitest + testing-library patterns.
- Run the new tests.
- Summarize files changed and verification completed.

Acceptance criteria:
- Meaningful unit coverage for ListSelectionBar.
- Tests fail if toolbar a11y regresses.
```

---

## Final Assessment

### Recommended implementation order

1. **UI-049** AddExistingSourceDialog → PickerDialogShell
2. **UI-050** PickerCheckboxRow / CheckboxList picker variant
3. **UI-051** FormDialogShell residuals (skills + model dialogs)
4. **UI-052** McpAuthFields
5. **UI-053** PageError/InlineError adoption
6. **UI-054** ArtifactsColumn extraction
7. **UI-056** bindCommonChatPanelProps
8. **UI-055** McpToolRiskBadge util
9. **UI-059** CredentialItem residual a11y/i18n
10. **UI-058** Shared chat/project skeletons
11. **UI-061** ListSelectionBar tests

### Shared components / hooks that should become frontend standards

- Existing: ConfirmDialog, EmptyState, PageHeader, PageRefreshButton, PageError, ListSelectionBar, LoadingSkeletons, FormDialogShell, PickerDialogShell, CompactListRow, ModelSelector, CheckboxList, useListSelection, useSelectableRow, useChatRuntime, bindChatPanelProps, chat send/enqueue helpers
- Emerging: PickerCheckboxRow, McpAuthFields, McpToolRiskBadge, ChatPanelSkeleton, bindCommonChatPanelProps

### Existing patterns that should be deprecated after migration

- AddExistingSourceDialog raw Dialog chrome (after UI-049)
- Inline picker checkbox rows (after UI-050)
- skills/[id] and model dialogs raw form chrome (after UI-051)
- Duplicated MCP auth field blocks (after UI-052)
- Ad-hoc error paragraphs/Alerts where PageError fits (after UI-053)
- Co-located ArtifactListRow/viewer in ArtifactsColumn (after UI-054)

### Areas inspected and found consistent

- All three pickers on PickerDialogShell
- Rename dialogs on FormDialogShell (templates/images/documents/artifacts)
- useListSelection + useSelectableRow + ListSelectionBar on project columns
- Chat: useChatRuntime, bind helpers on all ChatPanel mounts, EmptyState subtle, no window.confirm
- CompactListRow on manage-list cards
- Extended ModelSelector for override + defaults
- Destructive tokens (no production hardcoded reds)
- CredentialItem header icon aria-labels
- api-keys page composition (128 lines)
- Foundation tests for shells, send-turn, selectable row, bind helpers, chat runtime
- Nav a11y (`Button asChild` + `aria-current`)

### Areas that could not be inspected (or only shallowly)

- Full A2UI catalog matrix
- Knowledge-graph Unity internals
- Exhaustive locale completeness / visual QA
- Storybook (not present)
- Exhaustive a11y inside SourceCard/ArtifactsColumn monoliths

### Categories preventing a higher score

- **Composition (4.0):** SourceCard/ArtifactsColumn monoliths; useProjectChat still 438 LOC
- **Shared Reuse (4.7):** AddExistingSourceDialog + FormDialogShell residuals
- **Duplication (4.3):** picker rows, MCP auth fields, bind helper internals
- **Testing (4.1):** no Storybook; ListSelectionBar untested; monoliths untested

### Changes most likely to improve the score

1. UI-049 + UI-051 (finish shell adoption)
2. UI-050 + UI-052 (remove remaining twins)
3. UI-053 (error consistency)
4. UI-054 (composition)
5. UI-061 + broader foundation tests

### Overall frontend component architecture assessment

The frontend is **improving** and now scores **87/100** (+5 from 82). UI-041–UI-048 closed the remaining Medium clusters from the prior scorecard: ToolPicker shell, selectable-row twins, ChatPanel wiring, chat runtime thinning, Artifacts rename shell, CheckboxList i18n, foundation tests, and CredentialItem labels. Shared prefab-style foundations are broadly adopted. Remaining debt is Medium/Low and localized — finishing picker/form shell residuals, extracting a few small shared primitives, and expanding PageError/skeleton adoption are the clearest path into the low-90s. No High-severity architecture issues remain.

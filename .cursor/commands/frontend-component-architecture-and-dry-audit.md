# /frontend-component-architecture-and-dry-audit

Run this audit against the Construction OS repository.

Source: Auglet `frontend-component-architecture-and-dry-audit-prompt-set` (asset `6a6a3fa4-b6ca-4ae4-855e-efd9a3520f69`).

## Project notes

- Working directory: repo root (`construction-os`)
- Primary scope: `frontend/src` (pages, components, hooks, stores, design tokens)
- Write the completed report to `docs/audits/frontend-component-architecture-and-dry-audit.md`
- Compare against any previous report at that path and preserve issue IDs when possible
- Do not modify application code or delete database data during the audit (read-only)
- Treat source code as the source of truth over docs and CLAUDE.md notes

---

# Frontend Component Architecture and DRY Audit

Audit the current application frontend for unnecessary one-off components, duplicated UI patterns, inconsistent implementations, and missed opportunities to compose reusable base components.

Treat the current source code as the source of truth. Do not make assumptions based only on documentation, screenshots, naming conventions, or intended architecture.

## Objective

Find frontend implementations that violate DRY principles or recreate UI and behavior that should be handled through shared, configurable components.

Think of reusable frontend components like prefabs in Unity: create a reliable base component, expose intentional configuration options, and compose it into specialized interfaces rather than repeatedly rebuilding the same structure.

The goal is to gradually refactor the frontend into a consistent component system without creating unnecessary abstractions or forcing unrelated interfaces into the same component.

The audit must also produce a consistent frontend architecture score from 0 to 100 so progress can be tracked over time.

A score of 100 represents an exceptionally consistent, maintainable frontend with appropriate component reuse, composition, design-system adoption, shared behavior, accessibility, and testing.

A score of 100 does not require every component to be shared. Unique components are acceptable when their responsibilities are genuinely unique.

## Audit Scope

Inspect the frontend codebase, including:

* Pages, views, routes, layouts, and feature modules
* Shared and feature-specific components
* Forms, inputs, buttons, cards, modals, dialogs, tables, lists, navigation, tabs, menus, badges, alerts, loading states, and empty states
* Repeated JSX, HTML, templates, styling, state logic, and interaction patterns
* Component props, variants, composition patterns, hooks, utilities, and helper functions
* Responsive behavior
* Accessibility behavior
* Design tokens, spacing, typography, colors, borders, and visual states
* Components that appear reusable but have been independently recreated
* Existing shared components that are bypassed, duplicated, or inconsistently used
* Large components containing multiple reusable UI responsibilities
* Components with excessive conditional logic that may require composition or clearer variants
* Nearly identical components that differ only by content, styling, permissions, state, or minor behavior
* Repeated loading, error, confirmation, success, and empty-state implementations
* Repeated data-display and data-entry patterns
* Relevant frontend tests, stories, documentation, and component examples

## Audit Rules

Do not modify the code during this audit.

Do not fabricate issues to make the report appear useful.

Do not report an issue unless you can identify clear evidence in the source code.

Do not deduct points for a component merely because it is used only once. A one-off component is acceptable when its structure and behavior are genuinely unique.

Do not recommend abstraction when it would make the system harder to understand, create excessive prop complexity, tightly couple unrelated features, or produce a premature design system.

Prefer composition over large components with many boolean props.

Prefer extending an existing base component over creating another competing component.

Differentiate between:

1. True duplication that should be consolidated
2. Similar-looking components with meaningfully different responsibilities
3. Intentional feature-specific implementations
4. Existing shared components that need better variants or composition
5. Missing base components that should be introduced

For every issue, inspect all relevant usages before proposing a solution. The recommendation must account for existing behavior, states, accessibility, responsive behavior, styling, and tests.

## Audit Coverage

Record which frontend areas were inspected.

Report an estimated audit coverage percentage based on the portion of the relevant frontend codebase that was meaningfully reviewed.

Do not treat the coverage percentage as part of the architecture score.

Use these coverage labels:

* High coverage: 80–100%
* Moderate coverage: 50–79%
* Low coverage: below 50%

A high architecture score with low audit coverage must be clearly labeled as provisional.

Do not compare the current score directly with a previous score when the audits examined substantially different areas. In that case, mark the comparison as `Not directly comparable` and explain why.

## Frontend Architecture Score

Calculate one final score from 0 to 100 using the rubric below.

Each category receives a rating from 0 to 5.

Calculate the points for each category using:

`Category points = Category weight × Rating ÷ 5`

Round the final total to the nearest whole number.

Do not choose the final score first and work backward. Score each category independently from the evidence, then calculate the total.

### Universal Rating Scale

Use this same scale for every category:

| Rating | Meaning                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------- |
| 5      | Excellent. The standard is followed consistently, with no meaningful issues found.                    |
| 4      | Strong. A small number of isolated or low-impact issues exist.                                        |
| 3      | Mixed. The standard exists but is applied inconsistently across multiple areas.                       |
| 2      | Weak. Repeated or systemic problems exist, although some good patterns are present.                   |
| 1      | Poor. The standard is mostly absent, bypassed, or inconsistently understood.                          |
| 0      | Critical. There is no meaningful standard, or the current approach creates severe architectural risk. |

Ratings may use one decimal place when the evidence falls between two levels.

### Scoring Rubric

#### 1. Shared Component Reuse — 25 points

Evaluate whether repeated interface patterns use existing shared components rather than being rebuilt independently.

#### 2. Duplication and One-Off Implementations — 20 points

Evaluate the amount and impact of duplicated UI structure, styling, interaction logic, and frontend behavior.

#### 3. Composition and Component API Quality — 15 points

Evaluate whether components are designed as composable primitives with clear responsibilities.

#### 4. Design-System and Styling Consistency — 15 points

Evaluate whether the frontend consistently uses shared tokens, primitives, variants, and styling conventions.

#### 5. Shared Behavior, State, and Frontend Logic — 10 points

Evaluate whether repeated frontend behavior is centralized appropriately.

#### 6. Accessibility and Responsive Consistency — 10 points

Evaluate whether shared components provide consistent accessibility and responsive behavior.

#### 7. Validation, Testing, and Component Documentation — 5 points

Evaluate whether shared frontend foundations are protected and understandable.

## Scoring Guardrails

* Do not raise a rating because an issue was not inspected.
* Do not lower a rating solely because a component is unique.
* Do not reward abstraction for its own sake.
* Do not penalize intentional differences with clear product or technical justification.
* Use issue severity, affected locations, frequency, and maintenance impact as evidence for each rating.
* A single isolated low-severity issue should not substantially reduce a category.
* Repeated high-confidence issues across foundational components should substantially reduce the relevant category.
* Any unresolved High-severity issue affecting a foundational shared component normally prevents the related category from receiving a rating above 3.5.
* A category with multiple systemic High-severity issues normally should not receive a rating above 2.5.
* A rating of 5 requires affirmative evidence of consistency, not merely the absence of discovered problems.
* Do not change a category rating by more than 1.5 points between comparable weekly audits unless the report identifies the code changes or newly discovered evidence responsible for the change.
* Never adjust the score to create the appearance of progress.

## Historical Comparison

When previous audit results are available, include previous vs current scores, category deltas, resolved/new/remaining issues, and whether audits are directly comparable.

When no previous audit is available, label the current result as the baseline.

## Evidence Requirements

Every reported issue must include exact file paths, relevant names, duplicated implementations, why they should be related, existing shared components to use, configurable differences, risks, scoring categories affected, and a verification method. Include line numbers when reliable. Do not invent line numbers.

## Issue Prioritization

Assign each issue an ID (`UI-001`), Severity, Confidence, Estimated effort, and scoring categories affected. Order by recommended implementation sequence accounting for dependencies.

## Required Output

Write the completed report to `docs/audits/frontend-component-architecture-and-dry-audit.md`.

Begin with a concise audit summary, then the scorecard table, then a scannable issue table, then each issue with Problem / Current state / Goal state / Prompt to fix it, then Final Assessment.

When no meaningful issues are found, still score from affirmative evidence and do not manufacture recommendations.

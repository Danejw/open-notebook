# /dead-code-and-redundancy-audit

Run this audit against the Construction OS repository.

Source: Auglet `dead-code-and-redundancy-audit-prompt-set` (asset `003a3288-2045-4a37-a547-8032d19587a9`).

## Project notes

- Working directory: repo root (`construction-os`)
- Write the completed report to `docs/audits/dead-code-and-redundancy-audit.md`
- Compare against any previous report at that path (and the older `docs/audits/dead_code_redundancy_audit.md` if present) and preserve issue IDs when possible
- Do not modify application code or delete database data during the audit (read-only)
- Prefer filesystem (`Test-Path` / `git ls-files`) over stale search indexes when they disagree
- Account for Next.js App Router discovery, `frontend/src/proxy.ts` redirects, Surreal-Commands worker imports, and dynamic registration before declaring code dead

---

# Dead Code and Redundancy Audit

## Role

Act as a senior software architect and specialist auditor for **dead code and redundancy**.

Audit the repository thoroughly, using source code, configuration, tests, documentation, generated artifacts, and repository-native analysis tools as evidence.

Do not modify files during the audit. Your task is to investigate, score, and report.

Every verified issue must include a self-contained implementation prompt that another coding agent can copy and use to resolve that issue without needing the rest of the audit.

---

# Primary Objective

Find unused components, functions, routes, types, dependencies, feature flags, assets, obsolete configuration, and duplicate implementations, then estimate how much unnecessary code and maintenance burden remain.

Evaluate the repository in both directions:

1. Determine whether the intended system standards and contracts are followed by the implementation.
2. Detect important implementation behavior or risk that is missing from the intended standards, documentation, tests, or safeguards.

Do not automatically assume that the current implementation is correct. When evidence conflicts, determine whether the code, configuration, documentation, test, or intended contract should change. Mark ambiguous cases for human review instead of guessing.

---

# Audit Scope

Inspect all relevant areas, including where present:

- frontend components and pages
- backend routes and handlers
- services, utilities, hooks, and middleware
- types, interfaces, constants, and schemas
- scripts, jobs, and test utilities
- dependencies and development dependencies
- feature flags and experiments
- images, icons, fonts, styles, and static assets
- generated files and build artifacts
- legacy and migration-era implementations

Also inspect repository-specific conventions, framework behavior, generated code, dynamic registration, external entry points, and deployment configuration when they could change a conclusion.

Exclude third-party internals unless they are copied, vendored, configured, wrapped, or directly responsible for a repository-level issue.

---

# Required Investigation Process

1. Inventory entry points, routes, modules, dependencies, flags, and assets.
2. Analyze reachability using imports, exports, dynamic loading, framework conventions, scripts, configuration, tests, and external entry points.
3. Group implementations that appear to serve the same responsibility and compare behavior before calling them duplicates.
4. Inspect package manifests, build files, CI, and scripts before declaring dependencies unused.
5. Separate confirmed removable items, probable candidates, and items requiring human review.

Before reporting an issue, verify it using more than one signal whenever practical. Examples include:

- Source references and imports
- Runtime validators and static types
- Tests and fixtures
- Configuration and build behavior
- Documentation or architectural decisions
- Route, job, or plugin registration
- Database schemas and migrations
- Production telemetry or generated reports when available

If a required runtime system, external service, production environment, or private configuration cannot be inspected, state the limitation and reduce the coverage confidence. Do not invent evidence.

---

# Evidence Standard

Every issue must include:

- Exact file paths
- Exact symbols, routes, keys, schemas, jobs, components, or dependencies involved
- A concise explanation of the relevant behavior
- The evidence proving or strongly indicating the problem
- Searches, commands, tests, or analysis used
- Important dynamic or external behavior considered
- The likely authoritative implementation or contract
- Any uncertainty that affects the recommendation

Classify findings as:

- **Confirmed:** Direct repository evidence establishes the issue.
- **Probable:** Strong evidence exists, but runtime or external verification is still required.
- **Requires human review:** The intended behavior, ownership, external usage, or acceptable risk cannot be determined safely.

Do not place probable or uncertain estimates inside confirmed totals.

---

# Codebase Efficiency Score

Calculate a single **Codebase Efficiency Score from 0 to 100**.

A score of 100 means the repository has no meaningful issues within the verified audit scope and has effective safeguards against regression.

Use the same rubric and standards on every run so scores can be compared over time.

## Rating Scale

Rate every category from **0 to 5**:

- **5 — Excellent:** Complete, consistent, reliable, and well protected
- **4 — Good:** Minor isolated issues with limited risk
- **3 — Fair:** Useful and functional, but meaningful gaps remain
- **2 — Weak:** Multiple important problems or inconsistent practices
- **1 — Poor:** Substantial risk, drift, or unreliability
- **0 — Critical or absent:** The category is fundamentally unsafe, missing, or unusable

Calculate each weighted category using:

`Weighted category score = (rating ÷ 5) × category weight`

Round the final total to the nearest whole number. The displayed weighted scores must reproduce the final score.

## Weighted Rubric

| Category | Weight | What to Measure |
|---|---:|---|
| Dead and Unreachable Code | 25 | Unused files, symbols, services, scripts, and unreachable logic |
| Duplicate Implementations | 25 | Competing or copied implementations of the same responsibility |
| Dependency Efficiency | 15 | Unused, overlapping, obsolete, or unnecessary dependencies |
| Routes, Features, and Flags | 15 | Abandoned routes, incomplete features, and stale flags |
| Asset and Configuration Hygiene | 10 | Unused assets, styles, config, and generated clutter |
| Maintainability and Prevention | 10 | Safeguards that prevent dead code and duplication from returning |
| **Total** | **100** | |

## Grade Scale

| Score | Grade |
|---:|:---|
| 95–100 | A+ |
| 90–94 | A |
| 85–89 | B+ |
| 80–84 | B |
| 75–79 | C+ |
| 70–74 | C |
| 60–69 | D |
| 0–59 | F |

---

# Scoring Guardrails

- Do not award points merely because files, tools, tests, policies, or abstractions exist.
- Award credit only when they are accurate, used, effective, and supported by evidence.
- Do not reduce the score for style preferences without a concrete reliability or maintenance impact.
- Weight critical system behavior more heavily than isolated low-impact cleanup.
- Do not count the same root cause against multiple categories unless it independently affects each one.
- Do not increase a future score unless repository evidence confirms that the underlying problem was resolved.
- Keep category weights unchanged between audit runs.
- Make all scoring calculations visible and reproducible.
- A high score with Partial or Limited coverage must not be presented as definitive.

---

# Coverage Confidence

Assign one coverage label:

- **Comprehensive:** Nearly all relevant repository areas and evidence sources were inspected.
- **Strong:** All major systems were inspected with only lower-priority exclusions.
- **Partial:** Important systems were inspected, but meaningful areas remain unverified.
- **Limited:** Only a narrow portion of the repository could be assessed.

Also list:

- Areas inspected
- Areas excluded
- Tools and commands used
- Runtime or external systems unavailable
- Assumptions made

Present the score together with the coverage label.

---

# Historical Comparison

Search for a previous report at:

`docs/audits/dead-code-and-redundancy-audit.md`

If a previous audit exists:

- Read its score, category ratings, coverage, and issue IDs.
- Preserve issue IDs for persistent findings.
- Compare the current and previous scores.
- Report resolved, persistent, regressed, and new issues.
- Confirm resolution using current repository evidence.
- Do not mark an issue resolved merely because a file moved, a symbol was renamed, or the finding disappeared from a tool result.

If no previous report exists, mark this run as the baseline.

---

# Issue Classification

Assign every issue:

- **Severity**
  - **Critical:** Can cause security, privacy, data integrity, production, financial, legal, or release failure.
  - **High:** Can break an important workflow or create substantial architectural or maintenance risk.
  - **Medium:** Creates meaningful confusion, rework, inconsistency, or reliability risk.
  - **Low:** A valid improvement with limited operational impact.

- **Confidence:** High, Medium, or Low
- **Effort:** Small, Medium, or Large
- **Risk of change:** Low, Medium, High, or Unknown
- **Evidence class:** Confirmed, Probable, or Requires human review
- **Issue type:** dead code, duplicate implementation, unused dependency, stale route, stale feature flag, unused asset, obsolete configuration, generated-file clutter, incomplete migration, requires human review
- **Status:** New, Persistent, Regressed, or Previously unresolved

Estimate a **score impact** for each issue. Score-impact estimates are prioritization aids, not independent deductions that must sum exactly to the total score.

---

# Required Output

Save the completed report to:

`docs/audits/dead-code-and-redundancy-audit.md`

Include:

- Generated timestamp
- Repository name
- Branch name
- Commit or revision hash
- Audit scope
- Coverage label
- Tools and commands used

The report must use the following structure.

---

# 1. Executive Summary

Place this at the top.

Include:

- Codebase Efficiency Score
- Score out of 100
- Grade
- Coverage label
- Previous score
- Score change
- Total issues
- Issues by severity
- Issues by evidence class
- Most important finding
- Highest-leverage improvement
- Overall assessment
- Whether the audited area can currently be trusted for production work

Keep this section concise and scannable.

---

# 2. Scorecard

Use this table:

| Category | Weight | Rating 0–5 | Weighted Score | Evidence | Main Gap |
|---|---:|---:|---:|---|---|

The weighted scores must total the final score.

After the table, briefly explain each rating and cite the most important evidence.

---

# 3. Scannable Issue Table

Include every verified issue near the top of the report.

| ID | Issue | Type | Severity | Confidence | Evidence | Effort | Change Risk | Files or Systems | Score Impact | Status |
|---|---|---|---|---|---|---|---|---|---:|---|

Use sequential IDs:

- `RED-001`
- `RED-002`
- `RED-003`

Order issues by:

1. Severity
2. Score impact
3. Confidence
4. Change risk
5. Effort

Keep the table concise. Put full evidence and implementation instructions in the detailed issue sections.

---

# 4. Coverage and System Map

Create a map of what was inspected.

| Area or System | Primary Files | Evidence Inspected | Status | Coverage | Notes |
|---|---|---|---|---|---|

Use statuses appropriate to the audit, such as:

- Healthy
- Minor issue
- Inconsistent
- High risk
- Missing
- Unverified
- Not applicable

---

# 5. Detailed Issues

List every issue sequentially.

Each issue must use this exact structure:

## RED-001: Issue Title

**Type:**  
**Severity:**  
**Confidence:**  
**Evidence class:**  
**Effort:**  
**Risk of change:**  
**Score impact:**  
**Status:**  

### Problem

Explain the issue and why it matters.

Describe the concrete effect on correctness, security, performance, maintainability, users, developers, operators, or release safety.

### Current State

Describe the current implementation precisely.

Include:

- Exact file paths
- Exact symbols, routes, schemas, settings, jobs, dependencies, or components
- Current behavior
- Relevant callers and dependencies
- Evidence gathered
- Commands or searches performed
- Dynamic, external, or framework behavior considered
- Why the finding is Confirmed, Probable, or Requires human review
- Which implementation or contract appears authoritative and why

### Goal State

Describe the expected state after resolution.

Include:

- What should change
- What should remain unchanged
- The canonical implementation, standard, contract, or ownership boundary
- Required migration or compatibility behavior
- Required tests, documentation, telemetry, or safeguards
- How future developers should understand and use the corrected system

### Prompt to Fix It

Provide a complete, self-contained prompt that can be copied directly into another coding agent.

Use this exact structure inside the prompt:

**Task:**  
**Problem:**  
**Current state:**  
**Goal state:**  
**Files to inspect:**  
**Files likely to modify:**  
**Implementation requirements:**  
**Migration or rollout requirements:**  
**Constraints:**  
**Acceptance criteria:**  
**Verification:**  

The fix prompt must:

- Include all context required to solve the issue independently
- Name exact files and symbols
- Describe the desired behavior, not only the desired edit
- Preserve correct existing behavior
- Include relevant edge cases
- Include tests or verification commands
- Include documentation or telemetry updates when required
- Remove obsolete references created by the fix
- Avoid unrelated refactoring
- Require the fixing agent to stop and report ambiguity before changing an unclear public contract, data model, permission rule, or business decision

### Verification

Explain exactly how to confirm the issue is resolved.

Use repository-specific commands when available. Verification may include:

- Type checking
- Linting
- Unit, integration, contract, or end-to-end tests
- Builds
- Static analysis
- Runtime inspection
- Database validation
- Route or workflow testing
- Generated artifact comparison
- Search for obsolete references
- Monitoring or telemetry checks
- Manual review for behavior that cannot be automated

Verification must prove the underlying issue is resolved, not merely that the edited files compile.

---

# 6. Human Decisions and Unverified Risks

Create a separate section for findings that cannot be safely resolved automatically.

For each item, explain:

- What is known
- What remains unknown
- Why repository evidence is insufficient
- The possible consequences of each decision
- The owner or specialist needed
- The additional evidence required
- Which files or systems should be updated after the decision

Do not provide an automatic destructive or contract-changing fix prompt when the intended behavior cannot be established.

---

# 7. Highest-Leverage Fixes

Use this table:

| Priority | Issue ID | Why It Matters | Estimated Score Recovery | Effort | Change Risk |
|---:|---|---|---:|---|---|

Reference existing issue IDs. Do not create duplicate findings.

Prioritize fixes that remove root causes, protect critical workflows, and prevent multiple future issues.

---

# 8. Prevention Recommendations

Recommend safeguards only when supported by audit evidence.

For each safeguard, include:

- Problem prevented
- Proposed tool, test, policy, or architectural control
- Where it should run
- Whether it should block merging or deployment
- Expected false-positive or maintenance risk
- Owner or responsible area

Prefer automated, repeatable controls over reminders.

---

# 9. Historical Comparison

When a previous report exists, provide:

| Metric | Previous | Current | Change |
|---|---:|---:|---:|
| Total score | | | |
| Critical issues | | | |
| High issues | | | |
| Medium issues | | | |
| Low issues | | | |
| Confirmed findings | | | |
| Probable findings | | | |
| Coverage | | | |

Then list:

- Resolved issues
- Persistent issues
- Regressions
- New issues
- Score changes by category

When this is the first run, state that it establishes the baseline.

---

# 10. Final Assessment

Conclude with:

- Whether the audited system is dependable
- The greatest current risk
- The first issue that should be fixed
- The expected score after the highest-priority fixes
- The most valuable prevention mechanism
- Any important coverage limitation

Keep the assessment direct and evidence-based.

---

# Audit Behavior Rules

- Do not modify repository files during the audit.
- Do not fabricate findings, references, commands, results, or scores.
- Do not create vague best-practice issues without repository evidence.
- Consolidate symptoms that share the same root cause.
- Prefer fewer high-confidence findings over many speculative findings.
- Use exact file paths and symbols.
- Separate facts, inferences, estimates, and unknowns.
- Do not treat a tool warning as proof without inspecting the code and context.
- Do not recommend broad rewrites when a focused correction is sufficient.
- Do not change public contracts, permissions, data semantics, or business behavior without evidence of the intended state.
- Make every fix prompt independently usable.
- Preserve issue IDs across future audits.
- Use the same scoring rubric every run.
- Keep the report readable by someone who did not perform the audit.

Additional rules specific to this audit:

- Do not classify an item as dead solely because it has no direct static import.
- Account for file-based routing, reflection, decorators, glob discovery, webhooks, CLIs, and external consumers.
- Do not consolidate code that has meaningfully different business behavior.
- Prefer a smaller clearer codebase, not merely fewer lines.
- Do not create separate issues for trivial unused variables that standard linting can fix together.

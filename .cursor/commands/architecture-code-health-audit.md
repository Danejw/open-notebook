# /architecture-code-health-audit

Run this audit against the Construction OS repository.

Source: Auglet `architecture-code-health-audit` (asset `e4d4ba0b-752c-42af-83f3-1bc0390904d7`).

## Project notes

- Working directory: repo root (`construction-os`)
- Write the completed report to `docs/audits/audit_architecture_code_health.md`
- Include a version timestamp at the very top of the document (ISO-8601 with timezone)
- If `docs/understand_system.md` exists, use it; otherwise use root/`api`/`frontend`/`construction_os` CLAUDE.md files plus live code (code wins over docs)
- Compare against any previous report at that path and preserve issue IDs (`ARCH-001`, …) when possible
- Do not modify application code or delete database data during the audit (read-only)
- Prefer filesystem (`Test-Path` / `git ls-files`) over stale search indexes when they disagree
- Cross-check / do not duplicate: `frontend-component-architecture-and-dry-audit.md` (UI composition) and `dead-code-and-redundancy-audit.md` (orphan/unused code). This audit scores **architecture boundaries & maintainability**

### Stack mapping (adapt Auglet wording)

The source prompt mentions Supabase/server-actions patterns. Map them to this repo:

| Prompt language | Construction OS equivalent |
| --- | --- |
| Server actions / direct DB from UI | Component → `*Api` / raw `fetch` bypassing hooks/`apiClient` |
| API routes + services | FastAPI `api/routers/*` → `api/*_service` / `construction_os/services` → domain |
| Direct Supabase calls | Inline `repo_query` / SurrealQL in routers; domain bypass |
| Frontend data layer | `lib/hooks` + `lib/api` (axios) + Zustand (client-only) |
| Async jobs | `commands/` + surreal-commands workers |

Intended layering:

```
Frontend pages/components
  → lib/hooks (TanStack Query)
    → lib/api (axios apiClient; fetch only for SSE/binary)
    → FastAPI routers
      → api/*_service OR construction_os/services
        → construction_os/domain + graphs
          → repository → SurrealDB
    → commands/ (async workers)
```

---

# Architecture Code Health Audit

## Role

Act as a senior software architect auditing **system architecture and code health**, focusing on technical debt and architectural improvements.

Do not modify files during the audit. Investigate, score qualitatively with ✅ / ⚠️ / 🚫, and report.

Every verified issue must include a self-contained implementation prompt that another coding agent can copy and use to resolve that issue without needing the rest of the audit.

---

# Primary Objective

Generate a comprehensive architecture and code health audit report for the system.

Focus on identifying areas of technical debt and architectural improvements. Specifically look for:

- Duplicated utility functions
- Repeated data query patterns
- Redundant state management
- Inconsistent approaches to data manipulation (mixing hooks, direct API modules, raw `fetch`, router-inline SurrealQL, and domain/repository paths)
- Problematic reactive patterns (effects that refetch on every render, cascading calls, dual sources of truth for the same server state)
- Separation-of-concerns violations (UI owning mutations/security, non-centralized data access, unpredictable side effects)
- Layer inversions (e.g. `construction_os` importing `api`)
- God modules that mix transport, query construction, and orchestration

Propose a simplified target architecture and concrete refactoring steps that reduce code footprint and bug surface **without altering existing features**.

---

# Audit Scope

Inspect all relevant areas, including where present:

- `frontend/src` — pages, components, hooks, stores, API modules
- `api/` — routers, services, models
- `construction_os/` — domain, services, graphs, knowledge, jobs helpers
- `commands/` — async workers and shared command helpers

Also inspect repository conventions, dynamic registration, and worker entry points when they could change a conclusion.

Exclude third-party internals unless vendored, wrapped, or directly responsible for a repository-level issue.

---

# Required Investigation Process

1. Establish intended architecture from CLAUDE.md / code patterns (and `docs/understand_system.md` if present).
2. Inventory data-access styles in use (hooks → apiClient, component → Api, store → fetch, router → domain, router → inline SurrealQL, service → api package).
3. Find duplicated utilities, query blocks, CRUD hook clones, and twin ingest/list paths.
4. Flag god modules by size and responsibility mix; note reference implementations that already follow the intended pattern.
5. Identify reactive/state issues (Zustand mirroring React Query, seed-on-empty loops, ad-hoc polling).
6. For each issue, verify with more than one signal when practical (imports, call sites, tests, OpenAPI paths).

If a required runtime system cannot be inspected, state the limitation. Do not invent evidence.

---

# Evidence Standard

Every issue must include:

- Exact file paths (and line ranges when reliable)
- Exact symbols, routes, hooks, queries, or modules involved
- A concise explanation of the relevant behavior
- Evidence proving or strongly indicating the problem
- Severity: ✅ good / ⚠️ caution / 🚫 high risk (use 🚫/⚠️ on problems)
- Issue ID: `ARCH-NNN` (preserve IDs across re-runs when the same problem remains)

Classify findings as confirmed vs needs human review when ownership or intent is ambiguous.

---

# Required Report Structure

Write the completed report to `docs/audits/audit_architecture_code_health.md`.

Document must include:

1. **Metadata table** — version timestamp, generated time, repo, branch, commit, Auglet source, system-doc status, scope, cross-checks
2. **Overview** — one human-readable paragraph summarizing key findings
3. **Current state** — intended architecture, what is healthy (✅), structural pressure points, data-access styles in use
4. **Problems** — each issue with subsections below
5. **Target architecture** — simplified backend + frontend layering and non-negotiable principles
6. **Effect if fixed vs not fixed** — outcomes/risks tables plus suggested fix order (max leverage / min risk)
7. **Notes for future agents** — gotchas, missing files verified on disk, related audit boundaries

Throughout the document, use emojis (✅ good, ⚠️ caution, 🚫 error/high risk) to highlight status.

---

# Per-Issue Prompt Structure

For each identified problem or opportunity, include a ready-to-use instructional prompt an AI coding agent can execute. Every issue section must contain:

### The Problem

What is wrong and why it matters.

### The Current State

What the code does today (paths, patterns, duplication).

### The Goal State

What correct architecture looks like after the fix (behavior unchanged).

### A Unit Test (or UI test)

How to validate behavior (including keyboard/focus/aria when UI is involved). Use `N/A` only for pure docs tasks.

### The Implementation Prompt

A copy-pasteable prompt block that restates Problem / Current State / Goal State / Test / Implementation steps so another agent can fix the issue in isolation.

Follow YAGNI: prefer extraction and thinning over new frameworks. Prefer small slices over big-bang rewrites. Never delete database data or invoke destructive APIs as part of remediation guidance without explicit approval.

---

# Guardrails

- Do not modify application code during the audit
- Do not fabricate issues to make the report appear useful
- Do not report an issue without clear source evidence
- Do not conflate UI shell DRY debt or knip-orphan dead code with architecture boundary debt (link those audits instead)
- Treat missing-on-disk paths as retired only after `Test-Path` / `git ls-files` confirmation
- Code is the source of truth when docs disagree

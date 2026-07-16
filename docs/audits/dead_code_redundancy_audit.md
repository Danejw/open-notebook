# Dead Code and Redundancy Audit

| Field | Value |
| ----- | ----- |
| Generated | 2026-07-15T20:00:00-10:00 |
| Repository revision | `8455530fb426aaf27c4d513f690cacdcd129269c` |
| Branch | `dead-code` |
| Audit coverage | **Strong** |
| Previous audit | Re-audit 69/100 (Grade D), 2026-07-15T19:35:00-10:00 |
| Score change | **+12** (69 → 81) |

### Audit scope note

This audit evaluates the **working tree** (on-disk state). At committed `HEAD` (`8455530`), Streamlit-era HTTP wrappers and several orphan assets still exist in git history; on disk those files are deleted (**~2,346 LOC** net removal in `git diff --stat HEAD` for related paths). Evidence cites working-tree probes unless noted.

## Tools and commands used

- `git rev-parse`, `git branch`, `git log`, `git status --short`, `git diff --stat HEAD`
- Repository-wide ripgrep / Grep for imports, symbols, routes, flags, assets
- `Test-Path`, physical line counts via `ReadAllLines`, knip (`frontend/knip.json`)
- `uv run ruff check . --select F401` (clean) and `--select F841` (5 hits)
- Cross-check against prior `docs/audits/dead_code_redundancy_audit.md`
- Explore subagent verification of remants ([remnant probe](0e780a4a-eaa0-453c-83cc-f268ca7a4713))

**Exclusions:** `node_modules/`, `.venv/`, `.next/`, `__pycache__/`, third-party package internals (except langchain import smoke matrix).

**Dynamic-behavior caveats applied:** Next.js App Router file discovery; Next.js 16 `src/proxy.ts`; Surreal-Commands worker module import; A2UI dual env flags; legacy `OPEN_NOTEBOOK_*` env fallbacks; deep-linked `/share/...` routes; possible external HTTP consumers of public API routes; Esperanto dynamic `langchain-*` loading.

---

# 1. Executive Summary

| Metric | Value |
| ------ | ----- |
| **Codebase Efficiency Score** | **81 / 100** |
| **Grade** | **B** |
| **Coverage label** | Strong |
| Previous score | 69 / 100 (Grade D) |
| Score change | **+12** |
| Confirmed unnecessary code estimate | ~226 LOC; 3 files; 1 scrap file |
| Probable unnecessary code estimate | ~190 LOC; 1 hook; demo commands; one-shot scripts |
| Issues by severity | Critical: 0 · High: 1 · Medium: 1 · Low: 4 |
| Duplicate implementation groups | 4 active (2 intentional-remain) |
| Unused dependencies (confirmed) | 0 frontend; 0 Python confirmed |
| Most important finding | Post-baseline cleanup + prevention tooling landed; residual high-cost debt is RED-002 (project vs source chat parallel stacks) |
| Highest-leverage cleanup | Commit pending deletions; finish RED-002 hook/API consolidation; delete confirmed FE orphans (RED-022–024) |
| Overall assessment | The live architecture (Next.js → FastAPI routers → domain/graphs) is clear. Confirmed dead code is small. Efficiency is limited mainly by intentional-but-incomplete chat duplication and uncommitted HEAD/disk drift. |

---

# 2. Scorecard

| Category | Weight | Rating 0–5 | Weighted Score | Evidence | Main Gap |
| -------- | -----: | ---------: | -------------: | -------- | -------- |
| Dead and Unreachable Code | 25 | 4 | 20 | Wrappers/`migrate.py`/orphan types/SVGs gone on disk; 3 FE orphans (~226 LOC) remain | Uncommitted deletions at `HEAD`; FE orphans |
| Duplicate Implementations | 25 | 3.5 | 17.5 | `ChatWorkspace` + adapters; `chat_session` / `chat-stream-turn` / `getAuthToken` shared; routers+hooks still ~2.5k LOC forked | RED-002 incomplete |
| Dependency Efficiency | 15 | 5 | 15 | Knip unused-deps empty; sigma/next-themes/highlight.js gone; langchain smoke matrix keeps 9 packages | None material |
| Routes, Features, and Flags | 15 | 4 | 12 | Context + `ask/simple` OpenAPI-deprecated (sunset 2026-12-31); A2UI flags active | External-consumer unknown until sunset |
| Asset and Configuration Hygiene | 10 | 4 | 8 | `frontend/public/` = `logo.svg` only; Streamlit pyproject paths gone | Root `Untitled` scrap; HEAD/disk drift |
| Maintainability and Prevention | 10 | 4 | 8 | F401 un-ignored + blocking CI; knip warn job present | Knip `continue-on-error`; F841 still ignored (5) |
| **Total** | **100** | | **80.5 → 81** | | |

### Rating rationale

- **Dead (4):** Largest dead surface removed on disk (~1,870+ LOC wrappers). Remaining confirmed dead is small FE orphans. Not 5 because deletions are uncommitted and new orphans were found.
- **Duplicates (3.5):** UI shell unified; shared session/SSE helpers exist. Project/source routers and hooks remain large parallel stacks.
- **Dependencies (5):** No confirmed unused production deps after knip + import matrix.
- **Routes/flags (4):** Public deprecated routes retained with sunset — correct for API safety; not abandoned experiments.
- **Assets/config (4):** Public assets clean; one scrap file and uncommitted cleanup remain.
- **Maintainability (4):** Unused-import gate is real; knip not yet blocking; F841 suppressed.

### Score math

`(4/5)×25 + (3.5/5)×25 + (5/5)×15 + (4/5)×15 + (4/5)×10 + (4/5)×10 = 20 + 17.5 + 15 + 12 + 8 + 8 = 80.5` → **81**.

---

# 3. Unnecessary Code Summary

| Category | Confirmed | Probable | Requires Review |
| -------- | --------: | -------: | --------------: |
| Files | 4 | 1 | 0 |
| Symbols | 1 | 1 | 0 |
| Estimated lines of code | ~226 | ~190 | ~250 |
| Dependencies | 0 | 0 | 0 (langchain retained by matrix) |
| Routes | 0 | 0 | 2 (deprecated, sunset-dated) |
| Feature flags | 0 | 0 | 0 (A2UI active) |
| Assets | 0 | 0 | 0 |
| Duplicate implementation groups | 1 | 0 | 2 |

### How estimates were calculated

- **Confirmed:** `ProjectKnowledgePanel.tsx` (179), `AddSourceButton.tsx` (44), `ChatPanel.tsx` re-export (3), root `Untitled` (1 scrap file). `rg` importers in `frontend/src` → self-only or zero.
- **Probable:** `commands/example_commands.py` (142) — worker-registered demos only; `useMigrateFromProviderConfig` (~49 LOC) — documented hook with zero UI callers; one-shot `scripts/rebrand_*.py` / i18n fix scripts with no Makefile/CI refs.
- **Requires review:** Deprecated `POST /projects/{id}/context`, `POST /search/ask/simple` (sunset 2026-12-31); `legacy_embed_*` commands (~250 LOC) for queue drain; `OPEN_NOTEBOOK_*` env fallbacks.
- **Already removed on disk (uncommitted vs HEAD):** 13 `api/*` wrappers + `client.py`, `migrate.py`, 6 public SVGs, `auth.ts`/`common.ts` — ~2.3k LOC in `git diff --stat`.

---

# 4. Scannable Issue Table

| ID | Issue | Type | Severity | Confidence | Effort | Removal Risk | Files | Score Impact | Status |
| -- | ----- | ---- | -------- | ---------- | ------ | ------------ | ----- | -----------: | ------ |
| RED-002 | Project vs source chat parallel stacks | Duplicate implementation | High | High | Large | High | chat routers/graphs/hooks/API | 5 | **Partial** |
| RED-022 | Unused `ProjectKnowledgePanel` | Dead code | Medium | High | Small | Low | `ProjectKnowledgePanel.tsx` | 2 | **New** |
| RED-026 | Knip warn-only; F841 still ignored | Maintainability | Low | High | Small | Low | `test.yml`, `pyproject.toml` | 1 | **New** |
| RED-023 | Unused `AddSourceButton` | Dead code | Low | High | Small | Low | `AddSourceButton.tsx` | 1 | **New** |
| RED-024 | Deprecated `ChatPanel` re-export unused | Dead code | Low | High | Small | Low | `source/ChatPanel.tsx` | 1 | **New** |
| RED-025 | Root `Untitled` scrap file | Generated-file clutter | Low | High | Small | Low | `Untitled` | 0.5 | **New** |
| RED-011 | Ruff F401 / unused-import gate | Maintainability | Medium | High | Medium | Low | `pyproject.toml`, CI | 3 | **Resolved** |
| RED-016 | Direct `langchain-*` packages | Unused dependency | Low | High | Medium | High | `pyproject.toml`, smoke test | 1 | **Resolved** — retain |
| RED-014 | `POST /projects/{id}/context` | Stale route | Low | Medium | Small | Medium | `context.py` | 1 | **Resolved** — deprecated + sunset |
| RED-019 | Unused `globe.svg` / `next.svg` | Unused asset | Low | High | Small | Low | `frontend/public/` | 1 | **Resolved** |
| RED-020 | `EpisodeCard` auth-token duplicate | Duplicate implementation | Low | High | Small | Low | `EpisodeCard.tsx` | 1 | **Resolved** |
| RED-021 | `POST /search/ask/simple` | Stale route | Low | Medium | Small | Medium | `search.py` | 1 | **Resolved** — deprecated + sunset |
| RED-001 | Streamlit HTTP client + wrappers | Dead code | High | High | Medium | Low | 13 deleted `api/*` | 8 | **Resolved** on disk (uncommitted) |
| RED-003 | Unused npm sigma / forceatlas2 / next-themes | Unused dependency | Medium | High | Small | Low | `package.json` | 4 | **Resolved** |
| RED-004 | Dead exports in `source-references.tsx` | Dead code | Medium | High | Small | Low | `source-references.tsx` | 3 | **Resolved** |
| RED-005 | Auth token extraction ×4 | Duplicate implementation | Medium | High | Small | Low | `client.ts` | 3 | **Resolved** |
| RED-006 | Multiple context-building impls | Duplicate implementation | Medium | High | Medium | Medium | `context_mode.py` | 3 | **Resolved** (shared normalizer) |
| RED-007 | Create-Next-App public SVGs | Unused asset | Low | High | Small | Low | `frontend/public/` | 2 | **Resolved** |
| RED-008 | Orphan `auth.ts` / `common.ts` | Dead code | Low | High | Small | Low | `lib/types/` | 1 | **Resolved** |
| RED-009 | Stale Streamlit paths in pyproject | Obsolete configuration | Low | High | Small | Low | `pyproject.toml` | 1 | **Resolved** |
| RED-010 | `BASIC_AUTH_*` in `.env.example` | Obsolete configuration | Low | High | Small | Low | `.env.example` | 1 | **Resolved** |
| RED-012 | `stream_source_chat_response` | Dead code | Low | High | Small | Low | `source_chat.py` | 1 | **Resolved** |
| RED-013 | Sync `MigrationManager` | Dead code | Low | High | Small | Low | `migrate.py` | 1 | **Resolved** |
| RED-015 | Direct `highlight.js` dep | Unused dependency | Low | Medium | Small | Low | `package.json` | 1 | **Resolved** |
| RED-017 | Dual provider env maps | Incomplete migration | Medium | Medium | Medium | Medium | `provider_env_map.py` | 2 | **Resolved** |
| RED-018 | Stale `api/CLAUDE.md` services | Obsolete configuration | Low | High | Small | Low | `api/CLAUDE.md` | 1 | **Resolved** |

---

# 5. Duplicate Implementation Groups

| Group | Responsibility | Implementations | Recommended Canonical Implementation | Differences | Consolidation Risk |
| ----- | -------------- | --------------- | ------------------------------------ | ----------- | ------------------ |
| DUP-A | Backend HTTP access to own API | ~~`api/client.py` + wrappers~~ | **Deleted** ✅ | Was re-HTTP of same API | Low |
| DUP-B | Project vs source chat | Routers `chat.py`/`source_chat.py`; hooks `useProjectChat`/`useSourceChat`; graphs; API clients; **UI:** `ChatWorkspace` + adapters ✅ | Shared session/SSE helpers; keep scope-specific graphs | Project: retrieval, guest, A2UI, artifacts; source: ContextBuilder, abort | **High** — RED-002 |
| DUP-C | Chat execute vs queue | Immediate SSE vs `chat_queue` worker | **Remain separate** | Queue adds lease/idempotency | N/A — complementary |
| DUP-D | Context building | Deprecated full dump vs `chat_context` vs `ContextBuilder` | Runtime: `chat_context`; source: `ContextBuilder`; shared `context_mode` ✅ | Full dump vs preview vs retrieval | Low after deprecation |
| DUP-E | Frontend SSE auth token | ~~4 parsers~~ → `getAuthToken()` | **`client.ts`** ✅ | Identical localStorage parse | Low |
| DUP-F | Provider key maps | ~~Dual maps~~ → `provider_env_map.py` | **Single module** ✅ | Drift risk removed | Low |
| DUP-G | Knowledge panel UI | `ProjectKnowledgePanel` (unused) vs `SourceKnowledgePanel` (live) | Keep source panel; delete project orphan | Project panel never wired | Low — RED-022 |

---

# 6. Detailed Issues

## RED-002: Project and source chat stacks are near-duplicate

**Type:** Duplicate implementation  
**Severity:** High  
**Confidence:** High  
**Effort:** Large  
**Removal risk:** High  
**Score impact:** 5  
**Status:** Partial — slices 1–4 landed (session helpers, stream-turn, shared UI shell)

### Problem

Project chat and source chat maintain parallel routers, graphs, API clients, and React hooks. Shared infrastructure exists, but session CRUD, send paths, and scope-specific behavior remain forked. Every SSE/session bugfix tends to land twice.

### Current State

| Layer | Project | Source |
| ----- | ------- | ------ |
| Router | `api/routers/chat.py` — **744** LOC | `api/routers/source_chat.py` — **456** LOC |
| Hook | `useProjectChat.ts` — **835** LOC | `useSourceChat.ts` — **543** LOC |
| Graph | `construction_os/graphs/chat.py` — **343** LOC | `source_chat.py` — **283** LOC |
| API client | `frontend/src/lib/api/chat.ts` — **129** LOC | `source-chat.ts` — **78** LOC |
| Shared UI | `ChatWorkspace.tsx` (**258** LOC) via `ChatColumn` / `SourceChatColumn` / share page | Same |

**Delivered:** `chat_session.py`, `chat-stream-turn.ts`, `list_chat_sessions_for_out()`, `ChatWorkspace` + thin adapters.

**Remaining:** Separate graphs; hook/API duplication (~1,378 LOC hooks + ~207 LOC clients); optional send-turn consolidation.

**Searches:** `ChatWorkspace|ChatColumn|SourceChatColumn` in `frontend/src`; physical LOC on router/hook/graph files.

**Classification:** Confirmed duplicate — intentional product-scope split; consolidation incomplete.

### Goal State

Thin scope wrappers around shared session CRUD, ID normalization, hydration, and common SSE error handling. Distinct graphs and product features preserved. No single merged endpoint.

### Prompt to Fix It

**Task:** Continue RED-002 — extract remaining duplicated send-turn / session-list / SSE error patterns without merging product scopes.  
**Problem:** Parallel stacks still require duplicate fixes for SSE edge cases and session wiring (~2.5k+ LOC forked).  
**Current state:** `ChatWorkspace` + adapters unify UI; `chat_session.py` and `chat-stream-turn.ts` exist; routers `api/routers/chat.py` (744 LOC) and `source_chat.py` (456 LOC); hooks `useProjectChat.ts` (835) and `useSourceChat.ts` (543) still forked; graphs remain separate.  
**Goal state:** Shared module owns ID normalization, hydration, session list/response shaping, and common SSE error handling; scope wrappers stay thin; graphs remain separate.  
**Files to inspect:** `api/routers/chat.py`, `api/routers/source_chat.py`, `frontend/src/lib/hooks/useProjectChat.ts`, `useSourceChat.ts`, `chat-stream-turn.ts`, `construction_os/utils/chat_session.py`, `frontend/src/lib/api/chat.ts`, `source-chat.ts`.  
**Files likely to modify:** Same set; possibly new shared helpers under `construction_os/utils/` and `frontend/src/lib/hooks/`.  
**Implementation requirements:** Preserve AG-UI shapes, chat queue integration, A2UI gates, guest mode, source ContextBuilder/abort. Do not merge into one HTTP endpoint. Prefer composition over a mega-abstraction.  
**Removal and migration plan:** Move duplicated pure helpers first; update both call sites; delete dead private helpers; keep scope-specific behavior in wrappers.  
**Constraints:** Do not change product behavior; do not modify unrelated modules; stop and report if dynamic/external AG-UI consumers depend on exact payload shapes.  
**Acceptance criteria:** Measurable LOC reduction in duplicated helpers; existing chat/queue/hook tests pass; manual project + source + share chat smoke.  
**Verification:** `uv run pytest` chat/queue tests; `npm test` for hooks/`ChatColumn`/`SourceChatColumn`; `rg` for deleted helper names → 0; LOC of private helpers down.

### Verification

- Both chat surfaces stream and persist sessions.
- Guest/share project chat still works.
- Source chat abort + context modes unchanged.
- No new duplicate auth/session helpers introduced.

---

## RED-022: Unused `ProjectKnowledgePanel` component

**Type:** Dead code  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Small  
**Removal risk:** Low  
**Score impact:** 2  
**Status:** New

### Problem

`ProjectKnowledgePanel` (179 LOC) is never imported by pages or columns. The live UI uses `SourceKnowledgePanel` / `KnowledgeGraphView`. The orphan invites mistaken wiring and duplicates knowledge-panel maintenance.

### Current State

- File: `frontend/src/components/projects/ProjectKnowledgePanel.tsx` — exports `ProjectKnowledgePanel`
- `rg ProjectKnowledgePanel frontend/src` → definition only
- Live: `SourceKnowledgePanel` imported from `SourceDetailContent.tsx`
- Knip reports file as unused

**Classification:** Confirmed dead code.

### Goal State

File deleted; knowledge UI remains on source/graph paths only.

### Prompt to Fix It

**Task:** Delete unused `ProjectKnowledgePanel`.  
**Problem:** 179 LOC component with zero importers; live path is `SourceKnowledgePanel` / graph views.  
**Current state:** `frontend/src/components/projects/ProjectKnowledgePanel.tsx` — only self-references; knip unused-file.  
**Goal state:** File removed; no broken imports; source knowledge panel unchanged.  
**Files to inspect:** `ProjectKnowledgePanel.tsx`, `SourceKnowledgePanel.tsx`, project `[id]/page.tsx`, knowledge graph pages, `frontend/knip.json` output.  
**Files likely to modify:** Delete `ProjectKnowledgePanel.tsx` only (and any stale docs/CLAUDE mentions if present).  
**Implementation requirements:** Confirm no dynamic `import()` or string route reference; keep `SourceKnowledgePanel`.  
**Removal and migration plan:** Delete file; run knip + `rg ProjectKnowledgePanel`.  
**Constraints:** Do not refactor source knowledge UI; stop if a dynamic import or storybook reference appears.  
**Acceptance criteria:** File gone; `rg ProjectKnowledgePanel frontend` → 0 (except audits); app builds.  
**Verification:** `npx knip`; `npm test`; open source detail knowledge tab.

### Verification

- `rg ProjectKnowledgePanel` empty in `frontend/src`
- Source knowledge panel still renders

---

## RED-026: Knip warn-only; F841 still ignored

**Type:** Maintainability  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Removal risk:** Low  
**Score impact:** 1  
**Status:** New (residual after RED-011)

### Problem

RED-011 fixed F401 (blocking CI, ignore removed). Prevention remains incomplete: `frontend-knip` uses `continue-on-error: true`, and Ruff still ignores `F841` (5 unused-variable hits).

### Current State

- `.github/workflows/test.yml` — `frontend-knip` job: `continue-on-error: true`
- `pyproject.toml` `[tool.ruff.lint] ignore` includes `F841`
- `ruff check . --select F401` → All checks passed
- `ruff check . --select F841` → 5 errors

**Classification:** Confirmed prevention gap.

### Goal State

F841 cleaned and un-ignored (or narrowly noqa’d); knip moves to blocking after backlog triage, or stays warn with documented owner SLA.

### Prompt to Fix It

**Task:** Close RED-026 — clear F841 backlog; decide knip gate.  
**Problem:** 5 F841 hits; knip cannot fail CI.  
**Current state:** F401 blocking ✅; F841 ignored; knip warn-only in `test.yml`.  
**Goal state:** `ruff check . --select F841` clean; F841 removed from ignore (or justified per-line); knip either blocking or explicitly documented as warn with issue backlog.  
**Files to inspect:** `pyproject.toml`, `.github/workflows/test.yml`, F841 hit sites, `frontend/knip.json`.  
**Files likely to modify:** Same + files with unused locals.  
**Implementation requirements:** Prefer deleting unused locals; avoid broad `# noqa`. Triage knip unused exports (shadcn barrels) via `knip.json` ignore before blocking.  
**Constraints:** Dedicated small PR; do not disable useful exports needed by consumers outside entry globs without checking.  
**Acceptance criteria:** F841 clean locally; policy for knip recorded in contributing docs.  
**Verification:** `ruff check --select F841`; CI job config review.

### Verification

- CI config matches policy
- No new F841 in default `ruff check`

---

## RED-023: Unused `AddSourceButton` component

**Type:** Dead code  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Removal risk:** Low  
**Score impact:** 1  
**Status:** New

### Problem

`AddSourceButton` (44 LOC) has no importers. Source creation uses `AddSourceDialog` via `use-create-dialogs.tsx` / `SourcesColumn.tsx`.

### Current State

- `frontend/src/components/sources/AddSourceButton.tsx`
- `rg AddSourceButton frontend/src` → definition only
- Knip unused-file

### Goal State

File deleted; add-source UX unchanged via dialog path.

### Prompt to Fix It

**Task:** Delete unused `AddSourceButton.tsx`.  
**Problem:** 44 LOC with zero callers; dialog path is canonical.  
**Current state:** Only self-reference; `AddSourceDialog` used elsewhere.  
**Goal state:** File removed.  
**Files to inspect:** `AddSourceButton.tsx`, `AddSourceDialog`, `SourcesColumn.tsx`, `use-create-dialogs.tsx`.  
**Files likely to modify:** Delete `AddSourceButton.tsx` only.  
**Implementation requirements:** Confirm no dynamic import.  
**Constraints:** Do not change `AddSourceDialog` behavior.  
**Acceptance criteria:** File gone; `rg AddSourceButton` → 0 in `frontend/src`.  
**Verification:** knip; manually open add-source from project sources column.

### Verification

- Add-source dialog still opens from existing entry points

---

## RED-024: Deprecated `ChatPanel` re-export is unused

**Type:** Dead code  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Removal risk:** Low  
**Score impact:** 1  
**Status:** New

### Problem

`frontend/src/components/source/ChatPanel.tsx` is a 3-line deprecated re-export of `ChatWorkspace`. No production imports remain (tests import `ChatWorkspace` directly).

### Current State

```1:3:frontend/src/components/source/ChatPanel.tsx
/** @deprecated Import from `@/components/chat/ChatWorkspace` instead. */
export { ChatWorkspace as ChatPanel } from '@/components/chat/ChatWorkspace'
export type { ChatWorkspaceProps as ChatPanelProps } from '@/components/chat/ChatWorkspace'
```

- `rg from ['"].*ChatPanel['"]` in `frontend/src` → no production importers
- Callers use `@/components/chat/ChatWorkspace`

### Goal State

Compatibility shim deleted; `ChatWorkspace` is the only import path.

### Prompt to Fix It

**Task:** Delete deprecated `ChatPanel.tsx` re-export.  
**Problem:** Unused shim after ChatWorkspace migration.  
**Current state:** 3-line file; zero importers of `ChatPanel` symbol from that path.  
**Goal state:** File deleted; docs/CLAUDE updated if they still mention `ChatPanel` as entry.  
**Files to inspect:** `ChatPanel.tsx`, `ChatWorkspace.tsx`, any CLAUDE.md under `components/`.  
**Files likely to modify:** Delete shim; optional doc touch.  
**Constraints:** If any external package imports the old path, stop and report.  
**Acceptance criteria:** File gone; tests still pass (`ChatPanel.queue.test.tsx` already uses `ChatWorkspace`).  
**Verification:** `rg ChatPanel frontend/src` — only historical test filenames / messages ok; no import of shim.

### Verification

- `npm test` chat panel / workspace tests pass

---

## RED-025: Root `Untitled` scrap file

**Type:** Generated-file clutter  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Removal risk:** Low  
**Score impact:** 0.5  
**Status:** New

### Problem

Untracked root file `Untitled` (105 bytes) contains a curl to download upstream `open-notebook` `docker-compose.yml`. Not part of the product; confuses rebrand status.

### Current State

- Path: `Untitled` (repo root)
- Contents: `curl -o docker-compose.yml https://raw.githubusercontent.com/lfnovo/open-notebook/main/docker-compose.yml`
- Untracked scrap

### Goal State

File deleted (or never committed).

### Prompt to Fix It

**Task:** Delete root `Untitled` scrap.  
**Problem:** Accidental scratch file referencing legacy open-notebook compose URL.  
**Current state:** Untracked 105-byte file at repo root.  
**Goal state:** Absent from tree and never committed.  
**Files to inspect:** `Untitled` only.  
**Files likely to modify:** Delete `Untitled`.  
**Constraints:** Do not alter real `docker-compose*.yml` files.  
**Acceptance criteria:** `Test-Path Untitled` → false.  
**Verification:** `git status` shows no `Untitled`.

### Verification

- No accidental commit of scrap

---

## Resolved issues (historical — verified this run)

| ID | Resolution evidence (2026-07-15 working tree) |
| -- | ---------------------------------------------- |
| RED-001 | `Test-Path` false for `api/client.py` + wrapper services; `git status` shows deletions; **uncommitted** |
| RED-003 | Absent from `frontend/package.json` |
| RED-004 | Legacy converters gone; file slimmed |
| RED-005 / RED-020 | All SSE + `EpisodeCard` use `getAuthToken()` from `client.ts` |
| RED-006 | `construction_os/utils/context_mode.py` shared |
| RED-007 / RED-019 | `frontend/public/` contains only `logo.svg` |
| RED-008 | `auth.ts` / `common.ts` deleted on disk |
| RED-009 | No Streamlit `app_home` / `pages/**` ignores |
| RED-010 | `BASIC_AUTH` only in audit docs |
| RED-011 | F401 not in ignore; `ruff --select F401` clean; CI job blocking |
| RED-012 | `stream_source_chat_response` → 0 in `api/` |
| RED-013 | `migrate.py` deleted; `AsyncMigrationManager` only |
| RED-014 | OpenAPI `deprecated=True`, sunset 2026-12-31 in `context.py` |
| RED-015 | No direct `highlight.js` dependency |
| RED-016 | `tests/test_langchain_provider_imports.py` matrix — retain all 9 |
| RED-017 | `provider_env_map.py` canonical |
| RED-018 | `api/CLAUDE.md` domain-first |
| RED-021 | OpenAPI deprecated + sunset on `/search/ask/simple` |

---

# 7. Human Review Required

| Item | Why it looks unnecessary | Why static analysis is insufficient | Evidence needed | Owner | After decision |
| ---- | ----------------------- | ----------------------------------- | --------------- | ----- | -------------- |
| `POST /projects/{id}/context` | No FE consumer | External/script clients | Access logs before 2026-12-31 | API owner | Remove or extend sunset |
| `POST /search/ask/simple` | No FE consumer | Non-streaming API clients | Access logs | API owner | Same |
| `legacy_embed_*` commands | No new submitters | Drain pre-1.6 queues | Prod DB queue check | Platform | Remove after drain |
| `OPEN_NOTEBOOK_*` env fallbacks | Rebrand complete | Existing deployments | Install survey | Maintainers | Keep until major |
| `commands/example_commands.py` | Demo-only | May be used in training/docs | Confirm no external tutorials depend | Maintainers | Delete or quarantine under tests |
| `useMigrateFromProviderConfig` | No UI caller | Backend migrate route still live | Product: is ProviderConfig migration UI needed? | Frontend + API | Wire UI or delete hook; keep API if CLI uses it |
| One-shot `scripts/rebrand_*.py` / i18n fix scripts | No Makefile/CI refs | Manual upgrade runbooks | Maintainer policy | Maintainers | Archive or delete after rebrand freeze |
| Uncommitted cleanup (~23 deletions) | `HEAD` still has wrappers | Git state vs disk | Commit or revert | Maintainers | Land cleanup commit |
| `namespace_migration.py` / rebrand migrations | One-time | Upgrade support | Policy | Maintainers | Keep while upgrading |
| `src/proxy.ts` | Looks unused if unfamiliar | Next.js 16 convention | Framework docs | Frontend | **Keep** |
| Public deep links (`/share/...`) | No sidebar link | Intentional URLs | Product intent | Product | Retain |

Do **not** auto-delete rows in this section without owner sign-off.

---

# 8. Highest-Leverage Fixes

| Priority | Issue ID | Why It Matters | Estimated Score Recovery | Estimated Code Removed | Effort | Risk |
| -------: | -------- | -------------- | -----------------------: | ---------------------: | ------ | ---- |
| 1 | RED-001 (commit) | Lock in ~2.3k LOC removal; end HEAD/disk drift | +2 | 0 (git only) | Small | Low |
| 2 | RED-022 + RED-023 + RED-024 + RED-025 | Clear confirmed FE orphans/scrap | +2–3 | ~226 LOC + scrap | Small | Low |
| 3 | RED-002 | Largest live maintainability debt | +4–6 | Hundreds LOC net | Large | High |
| 4 | RED-026 | Harden prevention | +1 | ~0–20 LOC | Small | Low |

Expected score after priorities 1–2 and 4 (without full RED-002): approximately **84–86 (B+)**.  
Full RED-002 consolidation could reach ~**88–90 (A−/A)**.

---

# 9. Prevention Recommendations

| Safeguard | Prevents | Where it runs | Block merge? | False-positive risk |
| --------- | -------- | ------------- | ------------ | ------------------- |
| Keep blocking F401 CI job | Unused imports | CI | Yes ✅ already | Low–Medium |
| Clear F841 + un-ignore | Unused locals | Local + CI | Yes after cleanup | Medium |
| Promote knip to blocking after ignore tuning | Unused FE files/deps/exports | CI | Warn→Yes | Medium (shadcn barrels) |
| Custom lint / CODEOWNERS note: forbid new `api/client`-style wrappers | Streamlit-pattern regression | PR checklist | Yes | Low |
| Route inventory (OpenAPI vs FE corpus + allowlist) | Orphan APIs | Periodic CI | No (report) | Medium |
| Asset reference check for `frontend/public/` | Orphan assets | CI script | No | Low |
| Commit dead-code cleanups promptly | HEAD/disk drift | Process | N/A | Low |
| Deprecation sunset calendar for API routes | Forgotten deprecated endpoints | Docs + issue tracker | N/A | Low |
| Existing unused-i18n vitest | Dead translations | CI | Yes | Low |

---

# 10. Historical Comparison

| Metric | Baseline | Prior re-audit | Current | Change vs prior |
| ------ | -------: | -------------: | ------: | --------------: |
| **Total score** | 53 | 69 | **81** | **+12** |
| Grade | F | D | **B** | ↑ |
| Confirmed unnecessary files | 14 | 2 | **4** | +2 (new FE orphans found) |
| Confirmed unnecessary symbols | 8 | 1 | **1** | — |
| Estimated unnecessary LOC (confirmed) | ~1,750 | ~35 | **~226** | +191 (new orphans; prior residual assets cleared) |
| Duplicate implementation groups (active) | 7 | 5 | **4** | −1 |
| Unused dependencies (confirmed FE) | 3 | 0 | **0** | — |
| Critical issues | 0 | 0 | **0** | — |
| High open issues | 2 | 1 | **1** | — |
| Medium open issues | 8 | 3 | **1** | −2 |
| Low open issues | 8 | 6 | **4** | −2 |

### Issue status summary

| Status | IDs |
| ------ | --- |
| **Resolved** | RED-001, RED-003, RED-004, RED-005, RED-006, RED-007, RED-008, RED-009, RED-010, RED-011, RED-012, RED-013, RED-014, RED-015, RED-016, RED-017, RED-018, RED-019, RED-020, RED-021 (**20**) |
| **Partial** | RED-002 (**1**) |
| **New** | RED-022, RED-023, RED-024, RED-025, RED-026 (**5**) |
| **Persistent** | None beyond RED-002 partial |
| **Regressed** | None |

### Cleanup verified vs prior claims

| Prior claim | This-run result |
| ----------- | --------------- |
| HTTP wrappers deleted | ✅ On disk; still **uncommitted** |
| F401 / CI | ✅ Clean + blocking (prior detailed section was stale) |
| langchain matrix | ✅ `tests/test_langchain_provider_imports.py` |
| globe/next SVGs | ✅ Absent; `public/` = `logo.svg` |
| EpisodeCard auth | ✅ `getAuthToken()` |
| Chat UI unified | ✅ `ChatWorkspace` + adapters |
| New FE orphans | ❌ Prior miss — RED-022–024 |

---

# 11. Final Assessment

The repository is **substantially clearer** than the baseline. Developers can identify the canonical backend path (routers → domain/graphs) without a competing Streamlit HTTP client layer on disk. Shared chat helpers and a single workspace UI reduce confusion about where presentation lives.

**Canonical implementations are mostly identifiable**, except for remaining project/source chat backend/hook forks (RED-002), which still require dual mental models for SSE and session wiring.

**Obsolete code risk is low operationally** (deprecated APIs have sunsets; legacy embed commands are intentional drain valves). The main risk is **maintainability**: uncommitted cleanup can be reverted accidentally, and parallel chat stacks amplify defect cost.

**Greatest source of redundancy:** RED-002 project vs source chat stacks.

**First issue to fix:** Commit the pending deletions (RED-001 lock-in), then delete RED-022–025 orphans.

**Expected score after priorities 1–2 and 4:** ~84–86. After meaningful RED-002 helper extraction: ~88–90. Remaining code would be intentional scope splits, deprecated-but-sunset APIs, and rebrand compat layers — not abandoned features.

---

*End of audit. Issue IDs RED-001…RED-026 preserved for future runs.*

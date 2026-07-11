# Optimization Tracker

Living record of optimization work. Update this file whenever an item moves status or ships.

**Legend:** `pending` → `in-progress` → `done` | `wont-fix` | `deferred`

**Audits:**
- [Loading & startup](./2026-07-10-frontend-loading-performance-audit.md)
- [Interaction & runtime (addendum)](./2026-07-10-frontend-interaction-performance-audit.md)

**Measure progress:** `cd frontend && npm run measure:perf:reference` (once) then `npm run measure:perf` + `npm run measure:perf:compare` → see [baselines/README.md](./baselines/README.md)

**Goal:** Page load and interaction should feel **snappy and polished** — shell + skeletons immediately, no UI lag during clicks/typing/scrolling. Long-running backend work (ingestion, chat generation, podcasts) may take time; the UI must stay responsive throughout.

---

## Tier 1 — High impact, low risk

| ID | Item | Status | Verified | Notes |
|----|------|--------|----------|-------|
| T1-01 | Replace `ConnectionGuard` blank screen with app shell skeleton | **done** | build + manual | `AppShellSkeleton` while checking; cache preserved on mount |
| T1-02 | Dashboard auth: show shell + skeleton instead of full-page spinner | **done** | build | `(dashboard)/layout.tsx` |
| T1-03 | Notebook detail: render shell + column skeletons while metadata loads | **done** | build | In-page skeleton; no full-viewport spinner |
| T1-04 | Add `loading.tsx` for dashboard routes | **done** | measure:perf | 3 files: dashboard, notebooks, notebooks/[id] |
| T1-05 | Lazy-load i18n locales (en-US + detected only at startup) | **done** | measure:perf | `load-locale.ts`; startup en-US ~55 KB vs ~818 KB total |
| T1-06 | Lazy-load dashboard modals (`CommandPalette`, `ModalProvider`) | **done** | build | `dynamic()` in dashboard layout; create dialogs still eager |
| T1-07 | Add shared `Skeleton` UI primitive + use in lists/columns | **done** | build | `components/ui/skeleton.tsx`; NotebookList, Sources, ChatColumn |
| T1-08 | Remove unused `@monaco-editor/react` dependency | **done** | build | Removed from package.json |
| T1-09 | Throttle/defer markdown during chat streaming | **done** | build | rAF batch in `useNotebookChat`; plain text tail in `ChatPanel` |
| T1-10 | Debounce `buildContext()` on context selection changes | **done** | build | 400ms debounce in `useNotebookChat` |
| T1-11 | Migrate Sources page to React Query + skeleton table | **done** | build | `useAllSourcesInfinite`; `placeholderData` on sort |
| T1-12 | Add `loading.tsx` for sources, search, podcasts routes | **done** | measure:perf | 6 total (phase 6); **14 total** after phase 7 |
| T1-13 | Lazy-mount create dialogs on user intent | **done** | build | `dynamic()` + mount only when open |
| T1-14 | Add `loading.tsx` for settings, skills, tools, transformations, advanced | **done** | measure:perf | +8 route skeletons; instant shell on all main nav routes |
| T1-15 | Replace in-page spinners with skeleton rows (settings, skills, tools) | **done** | build | `ListRowsSkeleton`, `SettingsFormSkeleton` |

## Tier 2 — Medium effort

| ID | Item | Status | Verified | Notes |
|----|------|--------|----------|-------|
| T2-01 | `placeholderData` / keepPreviousData on list & detail queries | **done** | build | notebooks list + detail |
| T2-02 | Prefetch queries on sidebar link hover | **done** | build | `use-route-prefetch.ts`; notebooks/sources/podcasts |
| T2-03 | Dynamic-import `MarkdownRenderer` + defer KaTeX CSS | **done** | build | `MarkdownRendererCore.tsx`; KaTeX/hljs in dynamic chunk |
| T2-04 | Defer `SetupBanner` credential queries until idle | **done** | build | `useIdleReady` + `enabled` on credential hooks |
| T2-05 | Defer `CommandPalette` notebook fetch until palette opens | **done** | build | `useNotebooks(false, { enabled: open })` |
| T2-06 | Parallelize `/config` and `/api/config` in `fetchConfig()` | **done** | build | `config.ts` |
| T2-07 | Tune sources staleTime + refetchOnWindowFocus | **done** | build | 30s stale, refocus off for infinite source lists |
| T2-08 | Reduce chat session load waterfall | **done** | build | Prefetch first session when session list loads |
| T2-09 | Consolidate auth checks | **done** | build | `authEnabled` on `/api/config`; reuses cached config |
| T2-10 | Pass notes from notebook page to ChatColumn | **done** | tests | No duplicate notes spinner |
| T2-11 | Lazy-fetch archived notebooks list | **done** | build | `requestIdleCallback` before second query |
| T2-12 | Defer Search page model queries until Ask tab | **done** | build | `enabled` on `useModelDefaults`/`useModels` |
| T2-13 | Paginate or virtualize Search results | **done** | build | Initial limit 30 + load-more button |
| T2-14 | Optimize source modal open | **done** | build | Dynamic `SourceDetailContent`; mount only when open |
| T2-15 | Fix chat auto-scroll during streaming | **done** | build | `auto` scroll while streaming; smooth on new messages |
| T2-16 | Fix desktop layout flash on notebook detail | **done** | build | Lazy init `useMediaQuery` |
| T2-17 | Remove I18nProvider visibility hidden paint gate | **done** | build | Removed mount gate |
| T2-18 | Fix Inter vs Geist font CSS variable mismatch | **done** | build | `--font-inter` variable wired in layout + globals |
| T2-19 | Scope highlight.js CSS out of global `globals.css` | **done** | build | `markdown-hljs.css` imported in MarkdownRendererCore |
| T2-20 | Tune sidebar `Link` prefetch | **done** | build | `prefetch={false}` on nav links |
| T2-21 | Lazy-fetch podcast profiles until Templates tab | **done** | build | Profiles only mount with TemplatesTab |
| T2-22 | Share config for `useVersionCheck` | **done** | build | `getCachedConfig()` after ConnectionGuard; idle deferred |
| T2-23 | `useDeferredValue` for notebook list name filter | **done** | build | `notebooks/page.tsx` |
| T2-24 | rAF-batch source chat streaming updates | **done** | build | Same pattern as `useNotebookChat` |
| T2-25 | Lazy-mount note/insight modals in ModalProvider | **done** | build | Dynamic import; mount only when URL modal open |

## Tier 3 — Larger architectural

| ID | Item | Status | Verified | Notes |
|----|------|--------|----------|-------|
| T3-01 | Server/client split — RSC shells | partial | build | Server dashboard layout; AppShell hoisted; content-only route skeletons |
| T3-02 | Virtualize chat messages & long source lists | partial | build | Chat @ 40+ msgs; sources table @ 50+ rows |
| T3-03 | Optimistic UI for notebook/source/note mutations | **done** | build | Notebooks, sources, notes create/update/delete |
| T3-04 | Add bundle regression gate to CI | **done** | build + budget | Dedicated CI job; committed budgets + GitHub summary |
| T3-05 | Wire or remove dead `proxy.ts` middleware | **done** | build | Next.js 16 uses `proxy.ts` (not `middleware.ts`); root redirect active |
| T3-06 | Memoize chat message bubbles + MarkdownRenderer | **done** | build | `ChatMessageRow` memo + `ChatMessageList`; streaming tail plain text |
| T3-07 | Wire AbortController in `useSourceChat` streaming | **done** | build | Signal passed to fetch + SSE reader |
| T3-08 | Lazy-load markdown `<img>` elements | **done** | build | Already `loading="lazy"` in markdown components |
| T3-09 | Capture runtime Web Vitals | partial | build | LCP/INP/CLS at `window.__OPEN_NOTEBOOK_WEB_VITALS__`; `npm run measure:runtime` (Playwright) |

---

## Completed / shipped (2026-07-11)

Phase 1–3 optimizations: non-blocking shell, lazy i18n, deferred fetches, chat streaming UX, Sources React Query, measurement script.

**Key files changed:** `ConnectionGuard.tsx`, `(dashboard)/layout.tsx`, `load-locale.ts`, `useNotebookChat.ts`, `ChatPanel.tsx`, `sources/page.tsx`, `measure-perf.mjs`, skeleton/loading components.

### Phase 4 (same day)

Deferred markdown/KaTeX bundle, search model defer + paginated results, source modal lazy mount, sidebar hover prefetch, podcast profiles tab-gated, chat session prefetch, AbortController for source chat, font variable fix, hljs CSS scoped to markdown chunk.

**Key files changed:** `MarkdownRendererCore.tsx`, `SourceDialog.tsx`, `search/page.tsx`, `use-route-prefetch.ts`, `podcasts/page.tsx`, `useSourceChat.ts`, `globals.css`, `layout.tsx`.

### Phase 5 — Snappy navigation & fewer startup requests (2026-07-11)

Auth consolidated into cached config, route skeletons for sources/search/podcasts, lazy create + note/insight modals, source chat streaming batched via rAF.

**Key files changed:** `api/routers/config.py`, `auth-store.ts`, `use-version-check.ts`, `use-create-dialogs.tsx`, `ModalProvider.tsx`, `useSourceChat.ts`, `sources/search/podcasts/loading.tsx`.

**Snapshot:** `phase6-measurement-v2-17ffe87` vs reference — see baselines compare below.

### Phase 6 — Measurement v2 (2026-07-11)

Scorecard-focused baselines: split static JS vs media, compile/typecheck timings from build output, `--samples N` for median builds, informational vs primary metrics.

**Key files changed:** `perf-baseline-lib.mjs`, `measure-perf.mjs`, `capture-reference-baseline.mjs`, `enrich-snapshot-metrics.mjs`, `baselines/README.md`.

### Phase 7 — Snappy UI & interaction polish (2026-07-11)

Full route skeleton coverage, memoized chat rows, virtualized long threads, optimistic notebook mutations, skeleton loading states on settings/skills/tools.

**Key files changed:** `ChatMessageRow.tsx`, `ChatMessageList.tsx`, `ChatPanel.tsx`, `ListRowsSkeleton.tsx`, 8× `loading.tsx`, `use-notebooks.ts`, `SkillsList.tsx`, `tools/page.tsx`, `SettingsForm.tsx`.

**Snapshot:** `phase7-snappy-ui-17ffe87` — `loadingTsxCount` 0 → **14** (+14 vs reference)

### Phase 8 — Interaction & optimistic UI (2026-07-11)

Optimistic mutations for sources/notes/notebooks, virtualized sources table (50+ rows), memoized `SourcesTableRow`, bundle analyzer script.

**Key files changed:** `source-query-cache.ts`, `note-query-cache.ts`, `use-sources.ts`, `use-notes.ts`, `use-notebooks.ts`, `SourcesTableRow.tsx`, `sources/page.tsx`, `next.config.ts`, `analyze-bundle.mjs`.

**Snapshot:** `phase8-interaction-17ffe87`

### Phase 9 — CI budgets & runtime telemetry (2026-07-11)

Added a dedicated frontend performance CI job with hard budgets for top-10 JS, largest chunk, eager locales, and route skeleton coverage. Added bounded browser-side Web Vitals capture without network requests.

**Key files changed:** `perf-budget.json`, `check-perf-budget.mjs`, `test.yml`, `WebVitalsReporter.tsx`, `layout.tsx`.

**Snapshot:** `phase9-ci-runtime-1933667` — all budgets pass; scorecard remains **3 better · 0 worse · 1 same**.

### Phase 10 — RSC dashboard shell split (2026-07-11)

Hoisted `AppShell` into a server dashboard layout with a thin client auth boundary. Auth checks now keep the real sidebar visible (content skeleton only). Route `loading.tsx` files render main-area skeletons instead of duplicating the full shell.

**Key files changed:** `(dashboard)/layout.tsx`, `DashboardLayoutClient.tsx`, `DashboardContentSkeleton.tsx`, `AppShellSkeleton.tsx`, 14× `loading.tsx`, 13 dashboard pages (removed per-page `AppShell`).

**Snapshot:** `phase10-rsc-shell-1933667` — budgets pass; scorecard unchanged (**3 better · 0 worse · 1 same**).

---

## Pending (next batches)

| ID | Item | Priority | Notes |
|----|------|----------|-------|
| T3-01 | Server/client split — RSC shells | high | Partial: layout split + hoisted shell; individual pages still client components |
| T3-09 | Automated browser runner for LCP/INP/CLS | medium | `npm run measure:runtime` added; needs Playwright + live app/API fixture for CI |

## Baselines

**Workflow:** [baselines/README.md](./baselines/README.md) · **Manifest:** [baselines/manifest.json](./baselines/manifest.json)

**Reference:** `pre-optimization-17ffe87` · **Latest:** `phase10-rsc-shell-1933667` · Run `npm run measure:perf:compare`

| Metric | Reference | Phase 9 | Verdict |
|--------|-----------|---------|---------|
| `jsChunks.top10Bytes` | 3.03 MB | 2.33 MB | **−23% better** |
| `jsChunks.largestBytes` | 922 KB | 922 KB | same |
| `localeBundle.eagerLocaleCount` | 14 | 1 | **−93% better** |
| `loadingTsxCount` | 0 | **14** | **+14 better** |
| `static.mediaBytes` | 1.26 MB | 1.26 MB | same (fonts) |

**Scorecard (primary only):** 3 better · 0 worse · 1 same

Phase 6 snapshot: `phase6-measurement-v2-17ffe87`. Phase 5: `phase5-snappy-17ffe87`.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-10 | Initial audits; tracker created |
| 2026-07-11 | **Implemented Phase 1–3** (22 items done/partial); added `measure:perf` + baseline JSON |
| 2026-07-11 | **Implemented Phase 4** (13 more items); KaTeX/markdown deferred, search/podcast/source modal optimizations |
| 2026-07-11 | **Baseline infrastructure** — labeled snapshots, manifest, `measure:perf:reference` + `:compare` |
| 2026-07-11 | **Measurement v2** — scorecard, static JS/media split, compile timings; reference re-captured |
| 2026-07-11 | **Phase 7** — 14 route skeletons, chat memo + virtualization, optimistic notebooks, list skeletons |
| 2026-07-11 | **Phase 8** — optimistic source/note mutations, virtualized sources table, bundle analyzer |
| 2026-07-11 | **Phase 9** — CI performance budgets and browser Web Vitals capture |
| 2026-07-11 | **Phase 10** — Server dashboard layout, hoisted AppShell, content-only route skeletons |

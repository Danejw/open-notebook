# Frontend Loading & Perceived Performance Audit

**Date:** 2026-07-10  
**Scope:** Frontend startup path, navigation, data fetching, bundle composition, interaction responsiveness  
**Verdict:** The app **blocks the entire UI** on config and auth before showing structure. Heavy assets (14 locales, markdown stack, eager modals) load on every dashboard visit. Long backend tasks are acceptable; **blank screens and full-page spinners are not**.

**Tracker:** [tracker.md](./tracker.md)  
**Related:** [frontend/src/CLAUDE.md](../../frontend/src/CLAUDE.md), [architecture](../7-DEVELOPMENT/architecture.md)

---

## Executive summary

| Question | Answer |
|----------|--------|
| Why does the app feel slow on open? | **Sequential blocking gates** — `ConnectionGuard` returns `null`, then dashboard auth shows a full-page spinner, then pages add more spinners. |
| Is the backend the main bottleneck? | **Partially.** Config + auth + credential checks add a **frontend-orchestrated waterfall** before any shell renders. Page data (projects, sources) adds more waits. |
| Biggest bundle issues? | **14 i18n locales eager-loaded** (~770 KB source), **global KaTeX CSS**, **markdown/highlight stack** on chat/source pages, **eager modal/dialog trees** in dashboard layout. |
| Quick wins? | Shell skeletons, `loading.tsx`, lazy locales, lazy modals, skeleton components. |
| Regression risk if ignored? | High — every new dashboard feature added to layout/providers increases eager load. |

---

## Guiding principle

> Long-running tasks may take time, but the **UI should feel snappy**.

Apply this when reviewing any optimization PR:

1. **Never block the shell** for data that is not gating access.
2. **Show layout immediately** — skeletons beat spinners beat blank screens.
3. **Defer until intent** — load modals, palettes, and heavy editors on open/hover.
4. **Stale-while-revalidate** — keep previous data visible during refetch/navigation.

---

## Startup waterfall (current)

Every dashboard visit follows this sequence before meaningful UI appears:

```
Browser load
    │
    ▼
ConnectionGuard ──► return null (blank screen)
    │                 fetch /config
    │                 fetch /api/config  (sequential)
    ▼
I18nProvider ──► hidden children until mount
    │
    ▼
Dashboard layout ──► full-page LoadingSpinner
    │                 Zustand hydrate
    │                 fetch /api/auth/status
    │                 fetch /api/projects (if auth enabled)
    ▼
Page mount ──► AppShell + queries
    │           SetupBanner: credential + env status (2 calls)
    │           CommandPalette: projects list
    │           CreateDialogsProvider + ModalProvider (heavy, eager)
    ▼
Page-specific queries (projects, sources, notes, …)
```

### Blocking components (code references)

**1. ConnectionGuard — blank screen**

File: `frontend/src/components/common/ConnectionGuard.tsx`

- Returns `null` while `isChecking === true` (lines 101–104).
- User sees nothing until `/config` and `/api/config` complete.
- `resetConfig()` on every check forces a fresh fetch (no warm cache on retry).

**2. Dashboard auth — full-page spinner**

File: `frontend/src/app/(dashboard)/layout.tsx`

- Shows centered `LoadingSpinner` until auth hydrates and resolves (lines 40–47).
- Sidebar and page chrome are not visible during auth check.

**3. Project detail — another full-page spinner**

File: `frontend/src/app/(dashboard)/projects/[id]/page.tsx`

- Returns full-page spinner while `projectLoading` (lines 193–198).
- Shell (`AppShell`, header area) could render immediately with column skeletons.

**4. No App Router loading UI**

- **Zero** `loading.tsx` files under `frontend/src/app/`.
- Next.js cannot stream partial UI during client navigations.

---

## Findings by category

### 1. Bundle size & code splitting

| Issue | Impact | Location |
|-------|--------|----------|
| 14 locales bundled at startup | ~770 KB translation source parsed on first load | `frontend/src/lib/locales/index.ts` |
| KaTeX CSS loaded globally | Extra CSS on every page | `frontend/src/app/layout.tsx` |
| Markdown stack always bundled | react-markdown, highlight.js, rehype-katex wherever chat/sources render | `MarkdownRenderer.tsx`, `ChatPanel.tsx` |
| `@monaco-editor/react` unused | Dead dependency in package.json | Not imported anywhere |
| All dashboard pages `'use client'` | No SSR/streaming; full client JS before paint | Every route under `app/(dashboard)/` |
| Only one dynamic import | `@uiw/react-md-editor` in markdown-editor | `frontend/src/components/ui/markdown-editor.tsx` |

**Locale sizes (source bytes, 2026-07-10):**

| Locale | Size |
|--------|------|
| bn-IN | 93,634 |
| ru-RU | 73,650 |
| ja-JP | 61,469 |
| de-DE | 55,953 |
| ca-ES | 55,422 |
| fr-FR | 56,769 |
| es-ES | 54,824 |
| en-US | 54,710 |
| pl-PL | 54,450 |
| pt-BR | 53,982 |
| tr-TR | 53,744 |
| it-IT | 53,743 |
| zh-TW | 47,726 |
| zh-CN | 47,710 |

Only one language is needed at startup; the rest should lazy-load on switch.

### 2. Eager global providers (every dashboard page)

File: `frontend/src/app/(dashboard)/layout.tsx`

| Provider | What loads eagerly | Cost |
|----------|-------------------|------|
| `CreateDialogsProvider` | `AddSourceDialog`, `CreateProjectDialog`, `GeneratePodcastDialog` | Large dialog trees + hooks |
| `ModalProvider` | `SourceDialog` → `SourceDetailContent` (800+ lines, many API hooks) | Heavy even when no modal open |
| `CommandPalette` | `useProjects(false)` on mount | Extra API call |
| `AppShell` → `SetupBanner` | `useCredentialStatus()` + `useEnvStatus()` | 2 API calls per page |

### 3. Loading UX — spinners, no skeletons

- No `Skeleton` component under `frontend/src/components/ui/`.
- Lists and columns use centered `LoadingSpinner`, which feels slower than layout-preserving placeholders.

Examples:

- `ProjectList.tsx` — full section replaced by spinner while loading.
- `ChatColumn.tsx` — entire chat card blocked until sources/notes load.
- `[id]/page.tsx` — full viewport spinner for project metadata.

### 4. Data fetching patterns

| Pattern | Current behavior | Recommendation |
|---------|------------------|----------------|
| Project notes | Fetched in page **and** `ChatColumn` via `useNotes` | React Query dedupes network; pass notes as prop to avoid duplicate subscriptions |
| Sources staleTime | 5 seconds | Increase to 30–60s; poll only when `status === 'running'` |
| refetchOnWindowFocus | `true` on sources hooks | Causes flicker on tab return; disable for stable lists |
| placeholderData | Not used | Show stale data during navigation/refetch |
| Route prefetch | Only in `GeneratePodcastDialog` | Prefetch on sidebar hover |
| Config fetch | `/config` then `/api/config` sequential | Parallelize when both needed |
| Transitions | No `startTransition` / `useDeferredValue` | Use for search/filter to keep input responsive |

**Query client defaults** (`frontend/src/lib/api/query-client.ts`):

- `staleTime: 5 min`, `refetchOnWindowFocus: false` globally — good defaults.
- Individual hooks override with shorter stale times and `refetchOnWindowFocus: true` (sources).

### 5. Chat & long lists — no virtualization

File: `frontend/src/components/source/ChatPanel.tsx`

- Every message rendered with full `MarkdownRenderer` (GFM + highlight + KaTeX).
- No `react-virtual`, `@tanstack/react-virtual`, or `react-virtuoso`.
- Long conversations will degrade scroll and typing responsiveness.

### 6. Build baseline (2026-07-10)

```
npm run build  # frontend/
Next.js 16.2.6 — compiled ~8.4s, total ~34s
Routes: 16 app routes, all dashboard pages static or dynamic client bundles
loading.tsx files: 0
```

---

## Interaction matrix

| Interaction | Current | Target |
|-------------|---------|--------|
| App open | Blank → spinner → content | Shell skeleton → progressive fill |
| Sidebar navigate | Wait for page JS + queries | Instant skeleton via `loading.tsx`; cached stale data |
| ⌘K command palette | Mounted + projects prefetched on every page | Lazy mount; fetch on first open |
| Source modal | `SourceDetailContent` always in tree | Dynamic import on modal open |
| Mobile project tabs | Columns remount on tab switch | Preserve mounted state or hide with CSS |
| Browser tab refocus | Sources refetch at 5s stale | Show cache; background refresh without spinner |
| Language switch | Full-screen overlay (acceptable) | Keep; lazy locales make switch faster |
| Long chat thread | All messages re-render markdown | Virtualize + memoize message bubbles |

---

## Prioritized recommendations

### Tier 1 — High impact, low risk (do first)

| ID | Action | Files / area |
|----|--------|--------------|
| T1-01 | `ConnectionGuard`: render shell skeleton instead of `null` | `ConnectionGuard.tsx` |
| T1-02 | Dashboard auth: show `AppShell` + skeleton while auth resolves | `(dashboard)/layout.tsx` |
| T1-03 | Project detail: always show shell + column skeletons | `projects/[id]/page.tsx` |
| T1-04 | Add `loading.tsx` for dashboard and key dynamic routes | `app/(dashboard)/` |
| T1-05 | Lazy-load i18n locales | `lib/i18n.ts`, `lib/locales/index.ts` |
| T1-06 | Dynamic-import modals and command palette | `(dashboard)/layout.tsx`, providers |
| T1-07 | Add `Skeleton` component; replace list/column spinners | `components/ui/skeleton.tsx`, lists |
| T1-08 | Remove unused `@monaco-editor/react` | `package.json` |

### Tier 2 — Medium effort

| ID | Action |
|----|--------|
| T2-01 | `placeholderData: (prev) => prev` on navigation-sensitive queries |
| T2-02 | Sidebar `onMouseEnter` → `queryClient.prefetchQuery` |
| T2-03 | Dynamic-import `MarkdownRenderer`; scope KaTeX CSS to math pages |
| T2-04 | Defer `SetupBanner` queries (`requestIdleCallback` or `enabled` after paint) |
| T2-05 | Fetch command palette projects only when palette opens |
| T2-06 | Parallelize config fetches in `fetchConfig()` |
| T2-07 | Tune sources `staleTime` and `refetchOnWindowFocus` |

### Tier 3 — Architectural

| ID | Action |
|----|--------|
| T3-01 | Server/client split — RSC for static shells |
| T3-02 | Virtualize chat messages and long source lists |
| T3-03 | Optimistic UI for project/source/note CRUD |
| T3-04 | `@next/bundle-analyzer` in CI with recorded baselines |

---

## Suggested implementation phases

### Phase 1 — Perceived speed (~1–2 days)

Shell skeletons, `loading.tsx`, non-blocking ConnectionGuard/auth, project detail skeletons.

**Success criteria:** Sidebar visible within first paint; no blank screen on cold open.

### Phase 2 — Bundle diet (~1 day)

Lazy locales, lazy modals, remove dead deps, defer SetupBanner/command palette fetches.

**Success criteria:** Coverage tab shows only one locale loaded; smaller initial JS chunk.

### Phase 3 — Navigation polish (~1–2 days)

keepPreviousData, hover prefetch, refetch tuning, lazy markdown/KaTeX.

**Success criteria:** Route changes feel instant; tab refocus does not flash spinners.

---

## How to verify (manual)

1. **Cold open** — DevTools Performance: measure time until sidebar appears (target: no >300ms blank).
2. **Network on `/projects`** — Count requests before interactive UI (config ×2, auth ×1–2, credentials ×2, projects ×2 today).
3. **Navigation** — Click Projects → Sources → Search; each should show skeleton immediately.
4. **Coverage** — After lazy-i18n: unused locale bytes should drop sharply.
5. **Tab refocus** — Switch away and back; sources list should not full-page reload.

---

## Out of scope (this audit)

- Backend API response times (LLM, embedding, ingestion) — separate from UI snappiness.
- RAG/retrieval performance — see [RAG audit](../audits/2026-07-10-rag-implementation-audit.md).
- Docker/production CDN caching — see [reverse proxy](../5-CONFIGURATION/reverse-proxy.md).

---

## Related addendum

Runtime interaction findings (chat streaming jank, Sources page React Query gap, modal open cost, etc.) are in the [interaction audit addendum](./2026-07-10-frontend-interaction-performance-audit.md). All items are tracked in [tracker.md](./tracker.md).

---

## Changelog

| Date | Update |
|------|--------|
| 2026-07-10 | Initial audit from codebase investigation |
| 2026-07-10 | Cross-linked interaction addendum + expanded tracker |

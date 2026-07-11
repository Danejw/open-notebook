# Frontend Interaction & Runtime Performance Audit (Addendum)

**Date:** 2026-07-10  
**Scope:** Runtime interaction jank, chat streaming, page-specific data patterns, CSS/fonts, navigation prefetch  
**Builds on:** [2026-07-10-frontend-loading-performance-audit.md](./2026-07-10-frontend-loading-performance-audit.md)  
**Tracker:** [tracker.md](./tracker.md)

This addendum covers issues found in a **second pass** focused on what users feel *after* the app shell appears — typing, scrolling, toggling context, opening modals, and navigating between data-heavy pages.

---

## Executive summary

| Area | Verdict |
|------|---------|
| Chat / Ask streaming | **High jank** — full markdown re-parse on every token + smooth scroll on every message update |
| Context selection | **API storm** — `buildContext()` POST on every source/note toggle |
| Sources page | **No React Query** — manual fetch, full-page spinner, no shared cache with project views |
| Search page | Eager model fetches + up to 100 unvirtualized result cards |
| Modals | Source modal fires 3 parallel uncached API calls + heavy component tree on open |
| CSS / fonts | Geist vars referenced but Inter loaded; ~110 lines of hljs rules in global CSS |

**Recommended first pass after Tier 1 loading fixes:** T1-09 → T1-10 → T1-11 → T2-15 → T2-14 → T2-08

---

## Tier 1 — Interaction-critical

### T1-09 — Streaming chat re-renders full markdown on every token

**Impact:** High — primary source of lag during chat and Ask  
**Files:** `useProjectChat.ts`, `useSourceChat.ts`, `use-ask.ts`, `ChatPanel.tsx`, `StreamingResponse.tsx`

Each SSE chunk updates message state. The full message list re-renders; `AIMessageContent` runs `ReactMarkdown` + rehype (highlight + KaTeX) on the **entire growing string** every chunk.

```328:358:frontend/src/lib/hooks/useProjectChat.ts
          case 'TEXT_MESSAGE_CONTENT':
          case 'TEXT_MESSAGE_CHUNK': {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === targetId
                    ? { ...msg, content: msg.content + delta }
                    : msg
                )
              )
```

**Fix options (pick one or combine):**
- Memoize message bubbles (`React.memo` on `id` + content length)
- Throttle streaming UI updates (`requestAnimationFrame` or 50–100ms batch)
- Render streaming tail as plain text; run markdown only on `RUN_FINISHED`
- Incremental markdown parser for live preview

---

### T1-10 — Context toggle triggers API on every selection change

**Impact:** High — noticeable lag when bulk-including/excluding sources  
**Files:** `frontend/src/lib/hooks/useProjectChat.ts`

`buildContext()` POSTs to backend whenever `contextSelections`, `sources`, or `notes` change.

```496:506:frontend/src/lib/hooks/useProjectChat.ts
  useEffect(() => {
    const updateContextCounts = async () => {
      try {
        await buildContext()
      } catch (error) {
        console.error('Error updating context counts:', error)
      }
    }
    updateContextCounts()
  }, [buildContext])
```

**Fix:** Debounce 300–500ms; compute approximate counts client-side where possible; TanStack Query with debounced key; show stale counts while refetching.

---

### T1-11 — Sources page bypasses React Query

**Impact:** High — full spinner on every visit, no cache sharing with project source hooks  
**Files:** `frontend/src/app/(dashboard)/sources/page.tsx`

Uses manual `useState` + `useEffect` + `sourcesApi.list()`. Sort change clears list and refetches from scratch.

```43:92:frontend/src/app/(dashboard)/sources/page.tsx
  const fetchSources = useCallback(async (reset = false) => {
    // ...
      const data = await sourcesApi.list({ limit: PAGE_SIZE, offset: ..., sort_by, sort_order })
    // ...
  }, [sortBy, sortOrder, t('sources.failedToLoad')])

  useEffect(() => {
    fetchSources(true)
  }, [sortBy, sortOrder])
```

**Fix:** Migrate to `useInfiniteQuery` (mirror `useProjectSources`); table shell + skeleton rows; `placeholderData: (prev) => prev` on sort changes.

---

## Tier 2 — Page & navigation polish

### T2-08 — Chat session load waterfall

**Impact:** Medium  
**Files:** `useProjectChat.ts`, `useSourceChat.ts`

Three steps: list sessions → auto-select first in `useEffect` → fetch full session + messages in second query.

**Fix:** Embed last-session messages in list response; prefetch session when list resolves; show session shell with cached metadata.

---

### T2-09 — Auth check sequential waterfall

**Impact:** Medium (overlaps T1-02)  
**Files:** `use-auth.ts`, `auth-store.ts`

After hydrate: `checkAuthRequired()` → `/api/auth/status`, then if required `checkAuth()` → `/api/projects`.

**Fix:** Single status endpoint including token validity; cache `authRequired` in sessionStorage; show shell during checks.

---

### T2-10 — ChatColumn blocks on notes refetch

**Impact:** Medium  
**Files:** `projects/[id]/page.tsx`, `ChatColumn.tsx`

Page fetches notes; `ChatColumn` fetches again and shows full-column spinner until `notesLoading` clears.

**Fix:** Pass `notes` / `notesLoading` as props from page; render chat shell immediately with cached data.

---

### T2-11 — Projects list always fires two API calls

**Impact:** Medium  
**Files:** `projects/page.tsx`

Active + archived lists fetched on every mount even when zero archived projects.

**Fix:** Lazy-fetch archived with `enabled: showArchived`; fetch on collapse section expand.

---

### T2-12 — Search page eager model queries

**Impact:** Medium  
**Files:** `search/page.tsx`

`useModelDefaults()` + `useModels()` run on every visit; Ask deep-link waits on `modelsLoading`.

**Fix:** Defer until Ask tab active or first Ask action; long `staleTime` on cached defaults.

---

### T2-13 — Search results up to 100 cards, no virtualization

**Impact:** Medium  
**Files:** `search/page.tsx`

`limit: 100` with full card + collapsible match lists.

**Fix:** Paginate (20–30) or virtualize; lazy-render collapsible content.

---

### T2-14 — Source modal open cost

**Impact:** Medium  
**Files:** `ModalProvider.tsx`, `SourceDetailContent.tsx`, `dialog.tsx`

On open: 3 parallel manual fetches (source, insights, artifacts) — no React Query cache. Dialog is 70vw × 70vh with zoom animation.

**Fix:** Dynamic-import content; migrate to `useSource` / query hooks; `prefetchQuery` on hover; reduce dialog animation for large modals.

---

### T2-15 — Smooth scroll on every message update

**Impact:** Medium — scroll jank during streaming  
**Files:** `ChatPanel.tsx`

```150:152:frontend/src/components/source/ChatPanel.tsx
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
```

**Fix:** Scroll on user send / stream start / end only; use `'auto'` during stream; skip if user scrolled up.

---

### T2-16 — Desktop layout flash (`useIsDesktop`)

**Impact:** Medium  
**Files:** `use-media-query.ts`, `projects/[id]/page.tsx`

Hook defaults `false` until `useEffect` → desktop users briefly see mobile tabs, then three-column layout.

**Fix:** Lazy-init `useState` from `window.matchMedia`; CSS-first responsive layout where possible.

---

### T2-17 — I18nProvider paint gate

**Impact:** Medium (overlaps T1-05)  
**Files:** `I18nProvider.tsx`, `layout.tsx`

Children rendered with `visibility: hidden` until client mount — second paint gate after ConnectionGuard.

**Fix:** Remove gate if hydration-safe; lazy-init i18n with locale splitting.

---

### T2-18 — Font mismatch (Inter vs Geist CSS vars)

**Impact:** Medium  
**Files:** `layout.tsx`, `globals.css`

Layout loads Inter; `@theme` references `--font-geist-sans` / `--font-geist-mono` which are never defined. Inter lacks `display: 'swap'`.

**Fix:** Wire CSS vars to loaded font or switch to Geist via `next/font`; add `display: 'swap'`.

---

### T2-19 — Global highlight.js theme in globals.css

**Impact:** Medium  
**Files:** `globals.css` (~lines 316–419), `markdown/plugins.ts`

Custom `.hljs-*` rules ship on every page; duplicates runtime `rehype-highlight` work.

**Fix:** Scope under `.markdown-body`; import hljs theme only in `MarkdownRenderer`; delete duplicate global rules.

---

### T2-20 — Sidebar Link default prefetch contention

**Impact:** Medium  
**Files:** `AppSidebar.tsx`

8+ nav links prefetch route JS by default while page data queries run.

**Fix:** `prefetch={false}` on heavy routes; `onMouseEnter` + targeted `prefetchQuery` instead.

---

### T2-21 — Podcasts page eager profile fetches

**Impact:** Medium  
**Files:** `podcasts/page.tsx`, `TemplatesTab.tsx`

Episode + speaker profiles fetched at page level for setup banner before user opens Templates tab.

**Fix:** Move setup check into tab; `enabled: activeTab === 'templates'`.

---

### T2-22 — `useVersionCheck` extra config read

**Impact:** Low–Medium  
**Files:** `(dashboard)/layout.tsx`, `use-version-check.ts`

Third config touch on dashboard mount (cached after first, but couples mount to config).

**Fix:** Share config from ConnectionGuard context; defer with `requestIdleCallback`.

---

### T2-23 — Missing debounce / deferred value on filters

**Impact:** Low–Medium  
**Files:** `projects/page.tsx`, `search/page.tsx`

Project name filter re-runs `useMemo` every keystroke. Only `AddExistingSourceDialog` uses debounce elsewhere.

**Fix:** `useDeferredValue(searchTerm)` for project filter.

---

## Tier 3 — Architectural / lower priority

### T3-05 — `proxy.ts` is unwired middleware

**Impact:** Low  
**Files:** `frontend/src/proxy.ts`

Exports `proxy()` but no `middleware.ts` exists — Next.js never runs it. Root redirect handled by `app/page.tsx`.

**Fix:** Rename/wire as `middleware.ts` or delete dead file.

---

### T3-06 — Missing message-level memoization

**Impact:** Medium (architectural)  
**Files:** `ChatPanel.tsx`, `MarkdownRenderer.tsx`

Only `SourceCard` uses `memo` in sources area; chat bubbles and markdown re-render on any parent state change.

**Fix:** `memo` on `MarkdownRenderer` and extracted `ChatMessageBubble` with stable compare.

---

### T3-07 — `useSourceChat` abort controller not wired

**Impact:** Low (wasted work during cancel)  
**Files:** `useSourceChat.ts`

`abortControllerRef` never assigned during `sendMessage` — cancel is no-op mid-stream.

**Fix:** Wire `AbortController` into fetch; expose working cancel.

---

### T3-08 — Raw `<img>` in markdown pipeline

**Impact:** Low  
**Files:** `lib/markdown/components.tsx`

No lazy loading or sizing. Only sidebar logo uses `next/image`.

**Fix:** Custom markdown `img` with `loading="lazy"` and dimensions.

---

## Interaction matrix (addendum)

| Interaction | Current | Target |
|-------------|---------|--------|
| Chat streaming | Markdown re-parse every token + smooth scroll | Plain-text tail + throttled updates |
| Toggle source context | API POST per click | Debounced + client-side estimate |
| Open Sources page | Full spinner, no cache | Skeleton table + React Query cache |
| Open source modal | 3 fetches + heavy mount | Prefetch on hover + lazy import |
| Search (100 results) | All cards in DOM | Paginate or virtualize |
| Project filter typing | Sync filter every key | `useDeferredValue` |
| Desktop project open | Mobile tabs flash | Correct initial layout |

---

## Verification (addendum)

| Check | How |
|-------|-----|
| Chat stream FPS | Performance tab during long response — main thread should not spike every chunk |
| Context bulk toggle | Network tab — should not show N rapid `buildContext` calls |
| Sources revisit | Navigate away and back — should show cached data instantly |
| Scroll during stream | User scroll-up should not fight auto-scroll |
| Desktop project | No mobile tab flash on load (≥1024px viewport) |

---

## Changelog

| Date | Update |
|------|--------|
| 2026-07-10 | Second-pass interaction audit; 22 new tracker items (T1-09–T3-08) |

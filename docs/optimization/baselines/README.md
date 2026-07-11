# Performance baselines

Automated snapshots for proving frontend optimization work. Every snapshot uses the same `measure:perf` instrumentation so comparisons are apples-to-apples.

## Canonical snapshots

| Role | How it is set | Purpose |
|------|---------------|---------|
| **Reference** | `npm run measure:perf:reference` | Pre-optimization baseline from a clean git commit (worktree) |
| **Latest** | `npm run measure:perf` (default) | Most recent optimized state |
| **Compare** | `npm run measure:perf:compare` | Diff reference vs latest with scorecard |

See [`manifest.json`](./manifest.json) for current ids.

## Commands

From `frontend/`:

```bash
# 1. Capture authoritative pre-opt baseline (once, or when resetting reference)
npm run measure:perf:reference

# 2. Capture current optimized state after changes
npm run measure:perf -- --label phase6

# 3. Compare reference vs latest (primary metrics + scorecard)
npm run measure:perf:compare

# 4. Compare any two snapshots by id
node scripts/compare-baselines.mjs pre-optimization-abc1234 current-def5678

# 5. Backfill v2 metrics on an existing snapshot from current .next
node scripts/enrich-snapshot-metrics.mjs phase5-snappy-17ffe87

# 6. Validate the current production build against CI budgets
npm run measure:perf:check
```

### Options

| Flag | Effect |
|------|--------|
| `--label <name>` | Snapshot label (default: `current`) |
| `--set-reference` | Also set this snapshot as manifest `referenceId` |
| `--skip-build` | Reuse existing `.next` output (faster, less reliable) |
| `--samples N` | Run N builds and use median compile/wall times |
| `--compare` | Compare only; no build |
| `--description "..."` | Human note stored in snapshot |

## File naming

Snapshots are written as `{label}-{shortSha}.json` (e.g. `pre-optimization-17ffe87.json`). They are **never overwritten** by date.

Legacy file `2026-07-11.json` was a single-day overwrite artifact — superseded by labeled snapshots + manifest.

## Metrics captured (v2)

### Primary (scorecard)

| Metric | Better | Notes |
|--------|--------|-------|
| `jsChunks.largestBytes` | Lower | Biggest single JS chunk |
| `jsChunks.top10Bytes` | Lower | Sum of top 10 JS chunks (initial-load proxy) |
| `localeBundle.eagerLocaleCount` | Lower | Locales eagerly imported in `locales/index.ts` |
| `loadingTsxCount` | Higher | Route-level skeleton files |

### Informational (not scored as regression)

| Metric | Notes |
|--------|-------|
| `compileDurationMs` / `typecheckDurationMs` / `buildDurationMs` | Build-time only; grows with more modules |
| `static.jsChunksBytes` | All JS on disk — grows with code-splitting |
| `static.mediaBytes` | Fonts under `.next/static/media` |
| `static.totalBytes` / `staticAssetsBytes` | Total static — misleading when lazy chunks + fonts both grow |
| `jsChunks.totalBytes` | All JS chunks on disk (includes lazy route chunks) |
| `jsChunks.fileCount` | Chunk count — more code-splitting can increase this |
| `dynamicImportFileCount` | Files using `dynamic()` |
| `localeBundle.strategy` | `lazy-enUS-only` vs `eager-all` |

## Scorecard

`npm run measure:perf:compare` prints a scorecard counting **primary** metrics only:

- **better** — moved in the right direction
- **worse** — possible regression (investigate)
- **same** — no change
- **info** — informational metrics (media bytes, total chunk count, etc.)

## CI budgets

The `Frontend Performance Budget` job builds the frontend and runs
`npm run measure:perf:check`. Thresholds live in
[`../perf-budget.json`](../perf-budget.json). The job fails on regressions in:

- top-10 JS bytes
- largest JS chunk
- eager locale count
- route skeleton coverage

Build duration and total on-disk lazy bytes remain informational because they
are noisy and do not directly represent initial user-visible loading.

## Runtime Web Vitals

The client keeps a bounded history of Next.js Web Vitals without sending
network requests. Browser automation and DevTools can read:

```js
window.__OPEN_NOTEBOOK_WEB_VITALS__
```

This includes the latest LCP, INP, and CLS values after those metrics have
settled. An automated browser fixture is still needed before these values can
be compared reliably in CI.

## Supplementary (not for automated compare)

[`audit-estimate-2026-07-10.json`](./audit-estimate-2026-07-10.json) — manual audit estimates from before `measure:perf` existed. Useful context only; **not** the manifest reference.

## Workflow for perf PRs

1. Run `npm run measure:perf:compare` before starting (note reference).
2. Implement optimization.
3. Run `npm run measure:perf -- --label <batch-name>`.
4. Run `npm run measure:perf:compare` — attach output to PR or tracker.
5. Update [`../tracker.md`](../tracker.md) with snapshot id and key deltas.

## What is NOT automated yet

Browser collection of LCP/INP/CLS is instrumented but not run in CI because
authenticated dashboard routes require a live API fixture. Streaming frame
rate also remains manual. Use DevTools Performance plus the manual checklist
in [`../README.md`](../README.md) for interaction proof.

# Optimization Log

This folder records performance investigations, implemented optimizations, and verification outcomes for Construction OS. Use it as shared context when working on speed, perceived responsiveness, or bundle size — so we do not re-audit the same areas or regress past fixes.

## How to use this folder

1. **Before optimizing** — Read the latest audit and the [tracker](./tracker.md) to see what was already found, tried, or shipped.
2. **After investigating** — Add a dated audit or addendum (e.g. `YYYY-MM-DD-<area>-audit.md`).
3. **After implementing** — Update [tracker.md](./tracker.md) with status, PR/commit links, and how to verify.
4. **Before merging perf work** — Run `npm run measure:perf:compare` and record snapshot ids in the tracker.

## Guiding principle

> Long-running tasks may take time, but the **UI should feel snappy**.

- Show shell/layout immediately; load data progressively.
- Prefer skeletons and stale-while-revalidate over blank screens and full-page spinners.
- Defer non-critical work until after first paint or user intent (open dialog, hover nav, etc.).

## Documents

| Date | Document | Area | Status |
|------|----------|------|--------|
| 2026-07-10 | [Frontend loading & perceived performance audit](./2026-07-10-frontend-loading-performance-audit.md) | Startup, navigation, bundle | Phase 1 shipped (see tracker) |
| 2026-07-10 | [Frontend interaction & runtime audit (addendum)](./2026-07-10-frontend-interaction-performance-audit.md) | Chat streaming, context API, page-specific patterns | Phase 3 partial (see tracker) |
| — | [Optimization tracker](./tracker.md) | All items T1-01–T3-08 | See tracker |
| — | [Performance baselines](./baselines/README.md) | Automated snapshots | Reference + compare workflow |
| 2026-07-10 | [Audit estimate (manual)](./baselines/audit-estimate-2026-07-10.json) | Pre-tooling estimates | Context only — not manifest reference |

## Related docs

- [Construction OS documentation (GitHub)](https://github.com/lfnovo/construction-os/tree/main/docs) — canonical hosted docs index
- [Architecture](../7-DEVELOPMENT/architecture.md)
- [Frontend CLAUDE.md](../../frontend/src/CLAUDE.md)
- [RAG implementation audit](../audits/2026-07-10-rag-implementation-audit.md) (backend retrieval — separate concern)

## Verification checklist (reuse across optimizations)

Use these checks when validating frontend perf work:

| Check | Tool | What to look for |
|-------|------|------------------|
| First meaningful paint | DevTools Performance | Sidebar/shell visible without long blank gap |
| Network waterfall on `/projects` | DevTools Network | Count blocking requests before interactive UI |
| Navigation feel | Manual | Route change shows skeleton instantly, not blank |
| Tab refocus jank | Manual | Returning to tab does not flash full-page spinners |
| Bundle regression | `npm run measure:perf:compare` | Reference vs latest in `baselines/manifest.json` |
| Locale unused bytes | DevTools Coverage | Only en-US + active locale at startup |

## Measure progress

From `frontend/`:

```bash
# One-time: capture pre-optimization reference from clean git commit
npm run measure:perf:reference

# After each optimization batch
npm run measure:perf -- --label phase-N

# Prove improvement vs reference
npm run measure:perf:compare
```

See [baselines/README.md](./baselines/README.md) for full workflow. Snapshots are **never overwritten by date** — each run creates `{label}-{sha}.json` and updates `baselines/manifest.json`.

Update [tracker.md](./tracker.md) with snapshot ids and compare output after each batch.

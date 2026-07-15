# Critique: Fix Stuck Embedding Pipeline Stage

**Strategy/plan:** `.cursor/plans/fix_stuck_embedding_6002428b.plan.md`  
**App context:** Construction OS — async source ingestion via `surreal-commands` (`process_source` → fire-and-forget `embed_source` → `build_knowledge_graph`), with UI status driven by `source.command` (extract job) + `source.pipeline_stage`.

---

## 1. High-level overview

The plan correctly identifies the real defect: `pipeline_stage` is set to `embedding` before work finishes, and non-`ValueError` exits from `embed_source` never clear that stage, so `resolve_pipeline_status` reports eternal `running`/`embedding`.

The proposed forward fix is directionally right but has three material flaws:

1. **Marking `failed` before re-raising on every attempt** creates false “terminal” UI during surreal-commands retries, briefly enabling the Retry menu while embed may still be retrying.
2. **Historical recovery via “Retry UI” does not work for currently stuck sources** — the frontend only shows Retry Processing when `isFailed` is true; stuck-on-embedding cards are `running`, so users have no Retry control until something marks them `failed`.
3. **Jobs that never run** (worker down after extract, queue orphan) never enter the new exception handlers, so the forward-only patch alone cannot clear already-stuck rows without an explicit repair path.

A smaller, more reliable approach: treat provider/config failures as **terminal command results** (return failure + set `PIPELINE_FAILED`, rely on in-process `generate_embeddings` retries), plus a **one-shot stage repair** for existing `embedding` orphans so Retry becomes available. Eager retry-stage reset in the API is optional cleanup, not the core race the plan claims (queued extract status already wins in `resolve_pipeline_status`).

---

## 2. Findings at a glance

| Area | Rating | Finding |
|------|--------|---------|
| Problem diagnosis | ✔ | Correct root cause from code: stage set early; only success/`ValueError` paths advance; status ignores failed embed jobs. |
| Architecture fit | ✔ | Fixes persistence of `pipeline_stage` where the UI already understands `failed` + Retry — aligns with existing pipeline helpers. |
| Exception → `failed` then `raise` | ❌ | Sets terminal stage on *every* attempt, not final failure. During backoff, UI shows failed + Retry while job may still retry → double-submit risk. |
| Historical stuck sources | ❌ | Plan says use Retry UI; Retry is gated on `isFailed` in `SourceCard`. Stuck `embedding`/`running` sources **cannot** retry from UI today. Manual SQL alone is incomplete without making Retry available. |
| Never-ran `embed_source` | ❌ | Worker/orphan case never hits `except` handlers; forward fix does not recover those rows. |
| Retry API stage reset | ⚠ | Harmless but overstated. After retry swaps `source.command` to a queued job, `resolve_pipeline_status` already prefers `queued`/`running` over the embedding branch. |
| `ConfigurationError` → same as `ValueError` (try KG) | ⚠ | Config failures may still enqueue KG (which also needs models). Prefer `PIPELINE_FAILED` for config errors to surface root cause, or keep KG only for empty/invalid content. |
| Delete-then-fail embeddings | ⚠ | Plan ignores `DELETE source_embedding` before embed; failed attempts wipe prior vectors. Orthogonal but worsens blast radius; worth a follow-up. |
| Out of scope: no `embed_command_id` | 💡 | Acceptable for v1 if command returns terminal failed + stage repair. Longer-term, linking embed job to source would allow status reconciliation without stage thrash. |
| Tests scope | ✔ / ⚠ | Good unit coverage plan; should also assert Retry appears only when failed, and optionally a small test for `resolve_pipeline_status` + repair SQL/script helper if added. |
| Overall efficacy | ⚠ | Sound if revised; as written, risk of retry thrash and fails the stated recovery story for “many sources already stuck.” |

---

## 3. Detailed critique

### ✔ What works

- Touches the right file (`embed_source_command`) and reuses `PIPELINE_FAILED` / existing failed UX.
- Keeps success → knowledge graph chain intact.
- Adds tests — high leverage for regression.
- Explicitly avoids a large architecture rewrite (storing embed command IDs, redesigning fire-and-forget).

### ❌ Critical: `failed` + `raise` mid-retry

```python
except Exception as e:
    await set_pipeline_stage(..., PIPELINE_FAILED)
    raise  # surreal-commands retries up to 5x
```

Effects:

- Attempt 1 fails → UI `failed` → Retry menu appears.
- Job still queued for retry → user can `POST /sources/{id}/retry` → second `process_source` while first embed chain is alive.
- Attempt 2 starts → plan resets to `embedding` → UI flips back to processing.

**Better (fits this codebase):**

- Keep batch retries inside `generate_embeddings` (already `EMBEDDING_MAX_RETRIES=3`).
- On remaining `Exception` / `ConfigurationError`, **`set_pipeline_stage(FAILED)` and `return EmbedSourceOutput(success=False, ...)`** (same pattern as `ValueError`), do not re-raise — so surreal-commands does not re-run after the stage is terminal.
- Optionally keep command-level retry only for narrow transient DB errors if desired later; do not combine terminal stage write with re-raise.

### ❌ Critical: recovery story vs frontend

```tsx
{isFailed && ( /* Retry Processing */ )}
```

`isFailed` requires `status === 'failed' || pipelineStage === 'failed'`. Stuck sources are `running` + `embedding`. Therefore:

- “Already-stuck sources become retryable via existing Retry UI” is **false** without first marking them failed (or changing the UI gate).
- Manual SQL should be **required** in the plan (or a tiny admin/script), not “optional,” if the user’s pain is existing stuck volume.

### ❌ Jobs that never execute

If `process_source` set `embedding` and submitted `embed_source`, but the worker never ran (crash, import error, queue drain), no handler updates the stage. The plan’s exception-path fix never runs.

Need at least one of:

- Operator SQL/script: set `pipeline_stage = 'failed'` where stage is `embedding` and no `source_embedding` rows (and optionally aged), **or**
- Status reconciliation heuristic (stale embedding → failed) — heavier, not required for v1 if SQL/script is documented and run once.

### ⚠ Retry endpoint stage reset

After retry, new command status is `queued`, and:

```python
if extract_status in ("new", "queued", "running"):
    ...
```

runs **before** the `pipeline_stage == embedding` branch. Eager `PIPELINE_EXTRACTING` is fine for data cleanliness; do not treat it as the main fix.

### ⚠ ValueError → KG vs ConfigurationError

Current ValueError path intentionally continues to KG. Applying the same for `ConfigurationError` (“model not provisionable”) can launch another doomed AI job and confuse status (`knowledge_graph` then fail). Prefer:

- Content validation errors → try KG (current).
- Config/provider errors → `PIPELINE_FAILED` immediately with clear `error_message`.

### 💡 Alternative strategy (recommended)

1. **Terminalize embed failure in-command:** on `ConfigurationError` and post-batch `RuntimeError`/`Exception`, set `PIPELINE_FAILED`, return failure output (no raise). Rely on `generate_embeddings` internal retries.
2. **One-shot repair** for existing stuck rows (script or docs procedure using SurrealQL), so Retry appears.
3. **Optional:** allow Retry when extract completed + stage is `embedding`/`failed` — only if you want recovery without SQL; otherwise repair + failed stage is enough.
4. Keep API retry stage reset as a small nicety.
5. Defer `embed_command_id` linkage / DELETE-before-embed redesign.

---

## 4. Verdict

| Question | Answer |
|----------|--------|
| Is the strategy sound? | **Partially** — diagnosis is solid; failure-handler design and recovery story need revision. |
| Proceed as written? | **No** — amend before implementation. |
| Priority fixes to the plan | (1) Terminal `return` + failed stage, not failed+re-raise; (2) explicit historical repair; (3) acknowledge Retry UI gate; (4) fail-fast config errors without KG. |

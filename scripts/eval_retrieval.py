#!/usr/bin/env python3
"""Evaluate retrieval recall@k for vector vs hybrid modes.

Usage (API + DB must be running with an embedding model configured):

    uv run python scripts/eval_retrieval.py

Environment:
    CONSTRUCTION_OS_EVAL_LIMIT   override result limit (default 10)
    CONSTRUCTION_OS_EVAL_DRY_RUN if 1, only print dataset stats without calling retrieve
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

EVAL_PATH = ROOT / "tests" / "eval" / "graph_rag" / "baseline_queries.json"


def _parent_ids(results: list[dict]) -> set[str]:
    ids: set[str] = set()
    for row in results:
        for key in ("id", "parent_id"):
            value = row.get(key)
            if value:
                ids.add(str(value))
    return ids


def recall_at_k(expected: list[str], retrieved_ids: set[str]) -> float:
    if not expected:
        return 0.0
    hits = sum(1 for eid in expected if eid in retrieved_ids)
    return hits / len(expected)


async def run_eval() -> None:
    dataset = json.loads(EVAL_PATH.read_text(encoding="utf-8"))
    limit = int(os.getenv("CONSTRUCTION_OS_EVAL_LIMIT", "10"))
    dry_run = os.getenv("CONSTRUCTION_OS_EVAL_DRY_RUN", "0") == "1"

    by_class = defaultdict(list)
    for item in dataset:
        by_class[item["query_class"]].append(item)

    print(f"Loaded {len(dataset)} queries from {EVAL_PATH}")
    for cls, items in sorted(by_class.items()):
        print(f"  {cls}: {len(items)}")

    if dry_run:
        print("Dry run complete (no retrieval).")
        return

    from construction_os.retrieval import retrieve

    modes = ("vector", "hybrid")
    scores: dict[str, dict[str, list[float]]] = {
        mode: defaultdict(list) for mode in modes
    }

    for item in dataset:
        for mode in modes:
            try:
                bundle = await retrieve(
                    item["question"],
                    project_id=item.get("project_id"),
                    mode=mode,  # type: ignore[arg-type]
                    limit=limit,
                )
                retrieved = _parent_ids(bundle.to_search_results())
                score = recall_at_k(item.get("expected_source_ids") or [], retrieved)
            except Exception as e:
                print(f"  FAIL {item['id']} mode={mode}: {e}")
                score = 0.0
            scores[mode][item["query_class"]].append(score)
            scores[mode]["_all"].append(score)

    print("\nRecall@{} by mode / query class:".format(limit))
    for mode in modes:
        print(f"\n[{mode}]")
        for cls in sorted(k for k in scores[mode] if k != "_all"):
            vals = scores[mode][cls]
            avg = sum(vals) / len(vals) if vals else 0.0
            print(f"  {cls:12s}  {avg:.3f}  (n={len(vals)})")
        all_vals = scores[mode]["_all"]
        print(f"  {'ALL':12s}  {sum(all_vals)/len(all_vals):.3f}")


if __name__ == "__main__":
    asyncio.run(run_eval())

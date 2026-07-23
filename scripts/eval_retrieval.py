#!/usr/bin/env python3
"""Evaluate retrieval recall@k for vector vs hybrid modes.

Seed fixture IDs first (RAG-010):

    uv run python scripts/seed_retrieval_eval.py

Then run full eval (SurrealDB + embedding model required):

    uv run python scripts/eval_retrieval.py

Dry-run (no DB / no retrieve — validates dataset + corpus; used in CI):

    CONSTRUCTION_OS_EVAL_DRY_RUN=1 uv run python scripts/eval_retrieval.py

Environment:
    CONSTRUCTION_OS_EVAL_LIMIT   override result limit (default 10)
    CONSTRUCTION_OS_EVAL_DRY_RUN if 1, validate + summarize dataset only
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

EVAL_DIR = ROOT / "tests" / "eval" / "graph_rag"
EVAL_PATH = EVAL_DIR / "baseline_queries.json"
CORPUS_PATH = EVAL_DIR / "corpus.json"

# Stable Surreal record IDs owned by scripts/seed_retrieval_eval.py (RAG-010).
EVAL_PROJECT_ID = "project:retrieval_eval"
EVAL_SOURCE_ID_PREFIX = "source:eval_"

REQUIRED_FIELDS = ("id", "question", "query_class", "expected_source_ids", "project_id")


class EvalDatasetError(ValueError):
    """Raised when the retrieval eval dataset is missing or malformed."""


def load_eval_dataset(path: Path) -> list[dict[str, Any]]:
    """Load and parse the eval JSON file; must be a JSON array of objects."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise EvalDatasetError(f"eval dataset not found: {path}") from e
    except json.JSONDecodeError as e:
        raise EvalDatasetError(f"eval dataset is not valid JSON: {path}") from e
    if not isinstance(raw, list):
        raise EvalDatasetError("eval dataset must be a JSON array")
    return raw


def load_eval_corpus(path: Path = CORPUS_PATH) -> list[dict[str, Any]]:
    """Load the seeded retrieval corpus definition (source id, title, full_text)."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise EvalDatasetError(f"eval corpus not found: {path}") from e
    except json.JSONDecodeError as e:
        raise EvalDatasetError(f"eval corpus is not valid JSON: {path}") from e
    if not isinstance(raw, list):
        raise EvalDatasetError("eval corpus must be a JSON array")
    return raw


def validate_eval_corpus(corpus: list[dict[str, Any]]) -> None:
    """Fail fast if corpus rows lack stable eval IDs or text."""
    if not corpus:
        raise EvalDatasetError("eval corpus is empty")
    seen: set[str] = set()
    for index, item in enumerate(corpus):
        if not isinstance(item, dict):
            raise EvalDatasetError(f"corpus[{index}] must be an object")
        source_id = item.get("id")
        if not isinstance(source_id, str) or not source_id.startswith(
            EVAL_SOURCE_ID_PREFIX
        ):
            raise EvalDatasetError(
                f"corpus[{index}] id must start with {EVAL_SOURCE_ID_PREFIX!r}"
            )
        if source_id in seen:
            raise EvalDatasetError(f"corpus duplicate id: {source_id}")
        seen.add(source_id)
        title = item.get("title")
        full_text = item.get("full_text")
        if not isinstance(title, str) or not title.strip():
            raise EvalDatasetError(f"corpus[{index}] ({source_id}) missing title")
        if not isinstance(full_text, str) or not full_text.strip():
            raise EvalDatasetError(f"corpus[{index}] ({source_id}) missing full_text")


def validate_eval_dataset(dataset: list[dict[str, Any]]) -> None:
    """Fail fast if any query row is missing required fields or empty IDs."""
    if not dataset:
        raise EvalDatasetError("eval dataset is empty")
    for index, item in enumerate(dataset):
        if not isinstance(item, dict):
            raise EvalDatasetError(f"item[{index}] must be an object")
        for field in REQUIRED_FIELDS:
            if field not in item:
                raise EvalDatasetError(
                    f"item[{index}] ({item.get('id', '?')}) missing required field: {field}"
                )
        project_id = item.get("project_id")
        if project_id != EVAL_PROJECT_ID:
            raise EvalDatasetError(
                f"item[{index}] ({item.get('id', '?')}) project_id must be "
                f"{EVAL_PROJECT_ID!r} (seeded fixture), got {project_id!r}"
            )
        expected = item.get("expected_source_ids")
        if not isinstance(expected, list) or len(expected) == 0:
            raise EvalDatasetError(
                f"item[{index}] ({item.get('id', '?')}) expected_source_ids must be a non-empty list"
            )
        if not all(isinstance(eid, str) and eid.strip() for eid in expected):
            raise EvalDatasetError(
                f"item[{index}] ({item.get('id', '?')}) expected_source_ids must be non-empty strings"
            )
        for eid in expected:
            if not eid.startswith(EVAL_SOURCE_ID_PREFIX):
                raise EvalDatasetError(
                    f"item[{index}] ({item.get('id', '?')}) expected id {eid!r} "
                    f"must start with {EVAL_SOURCE_ID_PREFIX!r} (no placeholders)"
                )


def assert_dataset_ids_in_corpus(
    dataset: list[dict[str, Any]], corpus: list[dict[str, Any]]
) -> None:
    """Every expected_source_id in the dataset must exist in the corpus."""
    corpus_ids = {str(item["id"]) for item in corpus}
    for index, item in enumerate(dataset):
        for eid in item.get("expected_source_ids") or []:
            if eid not in corpus_ids:
                raise EvalDatasetError(
                    f"item[{index}] ({item.get('id', '?')}) expected id {eid!r} "
                    f"is not in the eval corpus"
                )


def summarize_dataset(dataset: list[dict[str, Any]]) -> dict[str, Any]:
    """Return total count and per-query_class counts."""
    by_class: dict[str, int] = defaultdict(int)
    for item in dataset:
        by_class[str(item.get("query_class") or "unknown")] += 1
    return {"total": len(dataset), "by_class": dict(sorted(by_class.items()))}


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
    dataset = load_eval_dataset(EVAL_PATH)
    validate_eval_dataset(dataset)
    corpus = load_eval_corpus(CORPUS_PATH)
    validate_eval_corpus(corpus)
    assert_dataset_ids_in_corpus(dataset, corpus)
    summary = summarize_dataset(dataset)
    limit = int(os.getenv("CONSTRUCTION_OS_EVAL_LIMIT", "10"))
    dry_run = os.getenv("CONSTRUCTION_OS_EVAL_DRY_RUN", "0") == "1"

    print(f"Loaded {summary['total']} queries from {EVAL_PATH}")
    print(f"Corpus sources: {len(corpus)} ({CORPUS_PATH.name})")
    for cls, count in summary["by_class"].items():
        print(f"  {cls}: {count}")

    if dry_run:
        print("Dry run complete (dataset + corpus validated; no retrieval).")
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

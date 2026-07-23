#!/usr/bin/env python3
"""Seed the dedicated retrieval-eval fixture project and sources (RAG-010).

Upserts stable Surreal IDs only (`project:retrieval_eval`, `source:eval_*`).
Does not delete or modify other user data.

Requires SurrealDB + embedding model configured (same as full eval).

Usage:

    uv run python scripts/seed_retrieval_eval.py

Then run recall@k:

    uv run python scripts/eval_retrieval.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from commands.embedding_commands import EmbedSourceInput, embed_source_command
from construction_os.database.repository import (
    ensure_record_id,
    repo_query,
    repo_relate,
    repo_upsert,
)
from scripts.eval_retrieval import (
    CORPUS_PATH,
    EVAL_PATH,
    EVAL_PROJECT_ID,
    assert_dataset_ids_in_corpus,
    load_eval_corpus,
    load_eval_dataset,
    validate_eval_corpus,
    validate_eval_dataset,
)


async def _reference_exists(source_id: str, project_id: str) -> bool:
    rows = await repo_query(
        """
        SELECT count() AS count FROM reference
        WHERE in = $source_id AND out = $project_id
        GROUP ALL
        """,
        {
            "source_id": ensure_record_id(source_id),
            "project_id": ensure_record_id(project_id),
        },
    )
    if not rows:
        return False
    count = rows[0].get("count", 0) if isinstance(rows[0], dict) else 0
    return int(count or 0) > 0


async def _ensure_reference(source_id: str, project_id: str) -> None:
    if await _reference_exists(source_id, project_id):
        return
    await repo_relate(source_id, "reference", project_id)


async def _upsert_project() -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data: dict[str, Any] = {
        "name": "Retrieval Eval Fixture",
        "description": (
            "Dedicated fixture project for scripts/eval_retrieval.py (RAG-010). "
            "Safe to re-seed; do not use for real work."
        ),
        "updated": now,
        "created": now,
    }
    await repo_upsert("project", EVAL_PROJECT_ID, data)


async def _upsert_source(source_id: str, title: str, full_text: str) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data: dict[str, Any] = {
        "title": title,
        "full_text": full_text,
        "topics": ["retrieval_eval"],
        "pipeline_stage": "embedding",
        "updated": now,
        "created": now,
    }
    await repo_upsert("source", source_id, data)


async def seed() -> None:
    corpus = load_eval_corpus(CORPUS_PATH)
    validate_eval_corpus(corpus)
    dataset = load_eval_dataset(EVAL_PATH)
    validate_eval_dataset(dataset)
    assert_dataset_ids_in_corpus(dataset, corpus)

    print(f"Seeding {EVAL_PROJECT_ID} with {len(corpus)} sources…")
    await _upsert_project()

    for item in corpus:
        source_id = str(item["id"])
        title = str(item["title"])
        full_text = str(item["full_text"])
        print(f"  upsert + embed {source_id}")
        await _upsert_source(source_id, title, full_text)
        await _ensure_reference(source_id, EVAL_PROJECT_ID)
        result = await embed_source_command(
            EmbedSourceInput(source_id=source_id, chain_kg=False)
        )
        if not result.success:
            raise RuntimeError(
                f"embed failed for {source_id}: "
                f"{result.error_message or result.error_type}"
            )
        print(f"    chunks={result.chunks_created}")

    print("Seed complete. Run: uv run python scripts/eval_retrieval.py")


if __name__ == "__main__":
    asyncio.run(seed())

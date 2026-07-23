"""Smoke-verify Graph RAG persist path → kg_query_run (KG-015).

Runs evidence retrieve in graph mode against a project and reports whether a
kg_query_run row was written. Does not change CI dry-run eval.

Usage:
  python scripts/smoke_kg_query_run.py --project-id project:xyz
  python scripts/smoke_kg_query_run.py --project-id project:xyz --query "see A-501"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any, Dict, Optional

from dotenv import load_dotenv

load_dotenv()

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.retrieval.evidence_retriever import get_graph_rag_mode, retrieve


async def count_query_runs(project_id: Optional[str] = None) -> int:
    vars: Dict[str, Any] = {}
    filt = ""
    if project_id:
        filt = " WHERE project_id = $project_id"
        vars["project_id"] = ensure_record_id(project_id)
    rows = await repo_query(
        f"SELECT count() AS c FROM kg_query_run{filt} GROUP ALL",
        vars,
    )
    if not rows:
        return 0
    return int(rows[0].get("c") or 0)


async def pick_default_project_id() -> Optional[str]:
    rows = await repo_query(
        """
        SELECT project_id, count() AS c FROM kg_entity
        GROUP BY project_id
        ORDER BY c DESC
        LIMIT 1
        """
    )
    if not rows:
        return None
    pid = rows[0].get("project_id")
    return str(pid) if pid is not None else None


async def smoke_kg_query_run(
    *,
    project_id: str,
    query: str = "REFERENCES sheet detail",
) -> Dict[str, Any]:
    before = await count_query_runs(project_id=project_id)
    mode = get_graph_rag_mode()
    bundle = await retrieve(
        query,
        project_id=project_id,
        mode="graph",
        limit=8,
    )
    after = await count_query_runs(project_id=project_id)
    latest = await repo_query(
        """
        SELECT id, query, retrieval_mode, created, metadata
        FROM kg_query_run
        WHERE project_id = $project_id
        ORDER BY created DESC
        LIMIT 1
        """,
        {"project_id": ensure_record_id(project_id)},
    )
    return {
        "project_id": project_id,
        "graph_rag_mode_env": mode,
        "query": query,
        "retrieval_mode_used": bundle.retrieval_mode_used,
        "item_count": len(bundle.items),
        "path_count": len(bundle.paths),
        "fallback_reason": bundle.fallback_reason,
        "kg_query_run_before": before,
        "kg_query_run_after": after,
        "persisted": after > before,
        "latest_run": latest[0] if latest else None,
    }


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Smoke Graph RAG kg_query_run (KG-015)")
    parser.add_argument("--project-id", default=None, help="Project record id")
    parser.add_argument(
        "--query",
        default="REFERENCES sheet detail",
        help="Retrieval query",
    )
    args = parser.parse_args(argv)

    project_id = args.project_id or await pick_default_project_id()
    if not project_id:
        print(
            json.dumps({"error": "No project_id and no kg_entity projects found"}),
            file=sys.stderr,
        )
        return 1

    result = await smoke_kg_query_run(project_id=project_id, query=args.query)
    print(json.dumps(result, indent=2, default=str))
    if not result.get("persisted") and result.get("path_count", 0) == 0:
        print(
            "Note: no paths and no persist — graph may have been empty; "
            "empty-graph path now also attempts persist when mode=graph.",
            file=sys.stderr,
        )
        return 2 if not result.get("persisted") else 0
    return 0 if result.get("persisted") else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

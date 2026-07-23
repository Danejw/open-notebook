"""Re-queue failed KG extraction runs after provider quota is restored (KG-012).

Dry-run by default — lists sources whose latest kg_extraction_run is failed.
With --apply, submits force extract via begin_kg_stage (does not invent credentials).

Usage:
  python scripts/requeue_failed_kg_extracts.py
  python scripts/requeue_failed_kg_extracts.py --apply
  python scripts/requeue_failed_kg_extracts.py --apply --limit 10 --project-id project:xyz
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.knowledge.pipeline import begin_kg_stage


async def list_sources_with_latest_failed_run(
    *,
    project_id: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Sources whose newest kg_extraction_run (by started_at/created) is ``failed``.
    """
    vars: Dict[str, Any] = {}
    project_filter = ""
    if project_id:
        project_filter = " AND project_id = $project_id"
        vars["project_id"] = ensure_record_id(project_id)

    # Ensure "latest overall" is failed, not just that a failed run exists
    all_latest = await repo_query(
        f"""
        SELECT source_id, status, extractor, error_message, started_at, created, project_id
        FROM kg_extraction_run
        WHERE true{project_filter}
        ORDER BY started_at DESC, created DESC
        """,
        vars,
    )

    seen: set[str] = set()
    latest_by_source: Dict[str, Dict[str, Any]] = {}
    for row in all_latest or []:
        sid = str(row.get("source_id") or "")
        if not sid or sid in seen:
            continue
        seen.add(sid)
        latest_by_source[sid] = row

    failed: List[Dict[str, Any]] = []
    for sid, row in latest_by_source.items():
        if str(row.get("status") or "") != "failed":
            continue
        failed.append(
            {
                "source_id": sid,
                "project_id": str(row.get("project_id") or "") or None,
                "extractor": str(row.get("extractor") or "generic"),
                "error_message": row.get("error_message"),
                "started_at": row.get("started_at") or row.get("created"),
            }
        )
        if limit is not None and len(failed) >= limit:
            break

    # Prefer ordering by most recent failure
    failed.sort(key=lambda r: str(r.get("started_at") or ""), reverse=True)
    if limit is not None:
        return failed[:limit]
    return failed


async def requeue_failed_kg_extracts(
    *,
    project_id: Optional[str] = None,
    dry_run: bool = True,
    limit: Optional[int] = None,
    force: bool = True,
) -> Dict[str, Any]:
    """List or re-submit force KG extracts for sources with latest status=failed."""
    candidates = await list_sources_with_latest_failed_run(
        project_id=project_id, limit=limit
    )
    if dry_run:
        return {
            "dry_run": True,
            "candidates": len(candidates),
            "sources": candidates,
            "queued": [],
        }

    queued: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for item in candidates:
        sid = item["source_id"]
        pid = item.get("project_id")
        project_ids = [pid] if pid else ([project_id] if project_id else [])
        try:
            command_id = await begin_kg_stage(
                sid,
                project_ids=project_ids or None,
                extractor=str(item.get("extractor") or "generic"),
                force=force,
                auto_select=True,
            )
            queued.append(
                {
                    "source_id": sid,
                    "command_id": command_id,
                    "extractor": item.get("extractor"),
                }
            )
        except Exception as e:
            errors.append({"source_id": sid, "error": str(e)})

    return {
        "dry_run": False,
        "candidates": len(candidates),
        "queued_count": len(queued),
        "queued": queued,
        "errors": errors,
    }


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Re-queue failed KG extractions after quota is fixed (KG-012)"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Submit force extracts (default is dry-run listing)",
    )
    parser.add_argument("--project-id", default=None, help="Limit to one project")
    parser.add_argument("--limit", type=int, default=None, help="Max sources to queue")
    args = parser.parse_args(argv)

    result = await requeue_failed_kg_extracts(
        project_id=args.project_id,
        dry_run=not args.apply,
        limit=args.limit,
    )
    print(json.dumps(result, indent=2, default=str))
    if not args.apply:
        print(
            "Dry run only. Fix provider quota, then re-run with --apply.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

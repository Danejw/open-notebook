"""Dedupe project-wide KG entity twins (KG-011). Scoped deletes only.

Usage:
  python scripts/dedupe_kg_entities.py
  python scripts/dedupe_kg_entities.py --apply
  python scripts/dedupe_kg_entities.py --apply --project-id project:xyz
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from construction_os.knowledge.dedupe import (
    dedupe_project_wide_entities,
    duplicate_identity_metrics,
)
from construction_os.knowledge.integrity import find_dangling_relations


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Dedupe project-wide kg_entity identity groups (KG-011)"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write merges/deletes (default is dry-run)",
    )
    parser.add_argument(
        "--project-id",
        default=None,
        help="Limit to one project id (e.g. project:abc)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max duplicate groups to process",
    )
    args = parser.parse_args(argv)

    before = await duplicate_identity_metrics(project_id=args.project_id)
    print(json.dumps({"before": before}, indent=2, default=str))

    result = await dedupe_project_wide_entities(
        project_id=args.project_id,
        dry_run=not args.apply,
        limit=args.limit,
    )
    # Avoid dumping every group id list on huge dry-runs
    summary = {k: v for k, v in result.items() if k != "groups"}
    if args.apply or (result.get("groups_found") or 0) <= 20:
        summary["groups"] = result.get("groups")
    else:
        summary["groups_sample"] = (result.get("groups") or [])[:5]
    print(json.dumps({"result": summary}, indent=2, default=str))

    after = await duplicate_identity_metrics(project_id=args.project_id)
    dangling = await find_dangling_relations()
    print(
        json.dumps(
            {
                "after": after,
                "active_dangling_from": len(dangling["from"]),
                "active_dangling_to": len(dangling["to"]),
            },
            indent=2,
            default=str,
        )
    )

    if not args.apply:
        print("Dry run only. Re-run with --apply to merge duplicates.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

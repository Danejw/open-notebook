"""Backfill legacy KG provenance fields (KG-010). No wholesale kg_* deletes.

Usage:
  python scripts/backfill_kg_legacy_provenance.py
  python scripts/backfill_kg_legacy_provenance.py --apply
  python scripts/backfill_kg_legacy_provenance.py --apply --project-id project:xyz
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from construction_os.knowledge.backfill import (
    backfill_legacy_provenance,
    provenance_metrics,
)


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill KG-010 provenance fields")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates (default is dry-run)",
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
        help="Max rows to update per backfill step (debug)",
    )
    args = parser.parse_args(argv)

    before = await provenance_metrics(project_id=args.project_id)
    print(json.dumps({"before": before}, indent=2, default=str))

    result = await backfill_legacy_provenance(
        project_id=args.project_id,
        dry_run=not args.apply,
        limit=args.limit,
    )
    print(json.dumps({"result": result}, indent=2, default=str))

    after = await provenance_metrics(project_id=args.project_id)
    print(json.dumps({"after": after}, indent=2, default=str))

    if not args.apply:
        print("Dry run only. Re-run with --apply to write updates.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

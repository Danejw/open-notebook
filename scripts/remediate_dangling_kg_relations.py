"""One-shot KG dangling-relation remediation (KG-002). Read dry-run then deactivate."""

from __future__ import annotations

import asyncio
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from construction_os.knowledge.integrity import (
    deactivate_dangling_relations,
    find_dangling_relations,
)


async def main() -> int:
    dry = "--apply" not in sys.argv
    found = await find_dangling_relations()
    print(
        json.dumps(
            {
                "dangling_from": len(found["from"]),
                "dangling_to": len(found["to"]),
                "from_ids": [str(r.get("id")) for r in found["from"]],
                "to_ids": [str(r.get("id")) for r in found["to"]],
            },
            indent=2,
        )
    )
    result = await deactivate_dangling_relations(dry_run=dry)
    print(json.dumps(result, indent=2))
    if dry:
        print("Dry run only. Re-run with --apply to deactivate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

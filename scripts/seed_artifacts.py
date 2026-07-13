"""One-off runner: seed/backfill all construction lifecycle artifact templates.

Usage:
    uv run --env-file .env python scripts/seed_artifacts.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


async def main() -> None:
    from construction_os.database.async_migrate import AsyncMigrationManager
    from construction_os.database.construction_artifact_templates import (
        CONSTRUCTION_ARTIFACT_TEMPLATES,
    )
    from construction_os.database.rebrand_migration import seed_construction_artifacts
    from construction_os.database.repository import repo_query

    manager = AsyncMigrationManager()
    if await manager.needs_migration():
        print("Running pending migrations...")
        await manager.run_migration_up()

    await seed_construction_artifacts()

    rows = await repo_query(
        "SELECT lifecycle_phase, count() AS count FROM artifact "
        "GROUP BY lifecycle_phase"
    )
    total = await repo_query("SELECT count() AS count FROM artifact GROUP ALL")

    print(f"Templates defined in code: {len(CONSTRUCTION_ARTIFACT_TEMPLATES)}")
    print(f"Artifacts in database: {total}")
    print("By phase:")
    for row in rows:
        print(f"  {row.get('lifecycle_phase')}: {row.get('count')}")


if __name__ == "__main__":
    asyncio.run(main())

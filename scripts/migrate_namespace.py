#!/usr/bin/env python3
"""One-shot namespace migration from open_notebook to construction_os."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / ".env")
os.environ["SURREAL_NAMESPACE"] = "construction_os"
os.environ["SURREAL_DATABASE"] = "construction_os"


async def main() -> int:
    from construction_os.database.async_migrate import AsyncMigrationManager
    from construction_os.database.namespace_migration import migrate_legacy_namespace_if_needed
    from construction_os.database.rebrand_migration import run_construction_os_rebrand

    migration_manager = AsyncMigrationManager()
    if await migration_manager.needs_migration():
        await migration_manager.run_migration_up()

    await migrate_legacy_namespace_if_needed()
    await run_construction_os_rebrand()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

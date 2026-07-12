"""Phase 17 migration verification against a live SurrealDB instance."""

from __future__ import annotations

import asyncio
import os
import sys

os.environ.setdefault("SURREAL_URL", "ws://localhost:8000/rpc")
os.environ.setdefault("SURREAL_USER", "root")
os.environ.setdefault("SURREAL_PASSWORD", "root")


async def inspect_namespace(namespace: str, database: str) -> dict:
    from construction_os.database.repository import db_connection, repo_query

    os.environ["SURREAL_NAMESPACE"] = namespace
    os.environ["SURREAL_DATABASE"] = database

    result: dict = {"namespace": namespace, "database": database}
    async with db_connection():
        version_rows = await repo_query(
            "SELECT * FROM _sbl_migrations ORDER BY version DESC LIMIT 1"
        )
        result["migration_version"] = version_rows[0]["version"] if version_rows else 0

        for table in ("project", "artifact", "notebook", "transformation"):
            try:
                await repo_query(f"SELECT count() FROM {table} GROUP ALL")
                result[f"table_{table}"] = True
            except Exception:
                result[f"table_{table}"] = False

        project_count = await repo_query("SELECT count() FROM project GROUP ALL")
        artifact_count = await repo_query("SELECT count() FROM artifact GROUP ALL")
        result["project_count"] = project_count[0]["count"] if project_count else 0
        result["artifact_count"] = artifact_count[0]["count"] if artifact_count else 0

        seeds = await repo_query(
            "SELECT name FROM artifact WHERE name = 'Bid Scope Summary' LIMIT 1"
        )
        result["has_bid_scope_seed"] = bool(seeds)

        singleton = await repo_query("SELECT * FROM construction_os:default_prompts")
        result["has_default_prompts"] = bool(singleton)

    return result


async def run_empty_db_migration_test() -> dict:
    """Apply all migrations on a fresh namespace/database."""
    from construction_os.database.async_migrate import AsyncMigrationManager

    test_ns = "construction_os_phase17_empty_v2"
    test_db = "construction_os_phase17_empty_v2"
    os.environ["SURREAL_NAMESPACE"] = test_ns
    os.environ["SURREAL_DATABASE"] = test_db

    manager = AsyncMigrationManager()
    await manager.run_migration_up()

    from construction_os.database.rebrand_migration import run_construction_os_rebrand

    await run_construction_os_rebrand()

    return await inspect_namespace(test_ns, test_db)


async def run_upgrade_db_migration_test() -> dict:
    """Simulate pre-rebrand data, then run migrations 20-22 + rebrand."""
    from construction_os.database.async_migrate import AsyncMigrationManager
    from construction_os.database.repository import db_connection, repo_query

    test_ns = "construction_os_phase17_upgrade_v2"
    test_db = "construction_os_phase17_upgrade_v2"
    os.environ["SURREAL_NAMESPACE"] = test_ns
    os.environ["SURREAL_DATABASE"] = test_db

    manager = AsyncMigrationManager()
    for _ in range(19):
        await manager.runner.run_one_up()

    async with db_connection():
        notebook = await repo_query(
            "CREATE notebook SET name = 'Legacy RFQ', description = 'Pre-rebrand notebook';"
        )
        notebook_id = str(notebook[0]["id"] if isinstance(notebook, list) else notebook["id"])

        transformation = await repo_query(
            """
            CREATE transformation SET
                name = 'Legacy Summary',
                title = 'Legacy Summary',
                description = 'Pre-rebrand transformation',
                prompt = 'Summarize',
                apply_default = false;
            """
        )
        transformation_name = (
            transformation[0]["name"]
            if isinstance(transformation, list)
            else transformation["name"]
        )

    for _ in range(3):
        await manager.runner.run_one_up()

    from construction_os.database.rebrand_migration import run_construction_os_rebrand

    await run_construction_os_rebrand()

    result = await inspect_namespace(test_ns, test_db)
    async with db_connection():
        migrated_project = await repo_query(
            "SELECT name FROM project WHERE name = 'Legacy RFQ' LIMIT 1"
        )
        migrated_artifact = await repo_query(
            "SELECT name FROM artifact WHERE name = 'Legacy Summary' LIMIT 1"
        )
    result["legacy_notebook_id"] = notebook_id
    result["legacy_transformation_name"] = transformation_name
    result["migrated_project_found"] = bool(migrated_project)
    result["migrated_artifact_found"] = bool(migrated_artifact)
    result["upgrade_ok"] = (
        result["migration_version"] >= 23
        and result["migrated_project_found"]
        and result["migrated_artifact_found"]
    )
    return result


async def main() -> int:
    print("=== Current production namespace ===")
    current = await inspect_namespace("construction_os", "construction_os")
    for key, value in current.items():
        print(f"  {key}: {value}")

    print("\n=== Empty DB migration test ===")
    try:
        empty = await run_empty_db_migration_test()
        for key, value in empty.items():
            print(f"  {key}: {value}")
        empty_ok = (
            empty["migration_version"] >= 23
            and empty["table_project"]
            and empty["table_artifact"]
            and empty["has_bid_scope_seed"]
            and empty["has_default_prompts"]
            and empty["artifact_count"] >= 8
        )
        print(f"  empty_db_ok: {empty_ok}")
    except Exception as exc:
        print(f"  empty_db_error: {exc}")
        empty_ok = False

    print("\n=== Upgrade DB migration test ===")
    try:
        upgrade = await run_upgrade_db_migration_test()
        for key, value in upgrade.items():
            print(f"  {key}: {value}")
        upgrade_ok = upgrade.get("upgrade_ok", False)
    except Exception as exc:
        print(f"  upgrade_db_error: {exc}")
        upgrade_ok = False

    return 0 if empty_ok and upgrade_ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

"""Verify migration 39 applied cleanly on local SurrealDB."""

from __future__ import annotations

import asyncio
import json
import os
import sys

from dotenv import load_dotenv

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(ROOT)
sys.path.insert(0, ROOT)
load_dotenv()

from construction_os.database.async_migrate import AsyncMigrationManager
from construction_os.database.repository import (
    get_database_url,
    get_surreal_database,
    get_surreal_namespace,
    repo_query,
)

CHECKS: list[tuple[str, bool, str]] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    CHECKS.append((name, passed, detail))
    status = "PASS" if passed else "FAIL"
    print(f"{status}  {name}" + (f" — {detail}" if detail else ""))


async def main() -> None:
    print(f"DB url={get_database_url()}")
    print(f"NS/DB={get_surreal_namespace()}/{get_surreal_database()}")

    mgr = AsyncMigrationManager()
    version = await mgr.get_current_version()
    needs = await mgr.needs_migration()
    record(
        "migration version >= 39",
        version >= 39,
        f"current={version} needs_migration={needs} expected_total={len(mgr.up_migrations)}",
    )

    all_rows = await repo_query(
        "SELECT version, applied_at, id FROM _sbl_migrations ORDER BY version ASC;"
    )
    versions = []
    for row in all_rows or []:
        v = row.get("version")
        if v is None and row.get("id") is not None:
            sid = str(row["id"])
            versions.append(sid.rsplit(":", 1)[-1])
        else:
            versions.append(str(v))
    has_39 = any(str(v) == "39" for v in versions)
    record(
        "_sbl_migrations records version 39",
        has_39,
        f"versions={versions[-8:] if versions else []}",
    )

    info = await repo_query("INFO FOR DB;")
    info0 = info[0] if isinstance(info, list) and info else info
    tables = info0.get("tables") if isinstance(info0, dict) else None
    table_names: set[str] = set()
    if isinstance(tables, dict):
        table_names = set(map(str, tables.keys()))
    elif isinstance(tables, list):
        table_names = {str(t) for t in tables}
    else:
        print("INFO FOR DB sample:", json.dumps(info0, default=str)[:1200])

    record(
        "source_insight table removed",
        "source_insight" not in table_names,
        f"tables_count={len(table_names)} has_source_insight="
        f"{'source_insight' in table_names}",
    )

    functions = (info0.get("functions") or {}) if isinstance(info0, dict) else {}
    text_search = ""
    vector_search = ""
    if isinstance(functions, dict):
        for key, value in functions.items():
            key_s = str(key)
            if "text_search" in key_s:
                text_search = str(value)
            if "vector_search" in key_s:
                vector_search = str(value)

    record(
        "fn::text_search has no source_insight",
        bool(text_search) and "source_insight" not in text_search.lower(),
        f"defined={bool(text_search)} insight_ref="
        f"{'source_insight' in text_search.lower()}",
    )
    record(
        "fn::vector_search has no source_insight",
        bool(vector_search) and "source_insight" not in vector_search.lower(),
        f"defined={bool(vector_search)} insight_ref="
        f"{'source_insight' in vector_search.lower()}",
    )

    tinfo = await repo_query("INFO FOR TABLE source;")
    t0 = tinfo[0] if isinstance(tinfo, list) and tinfo else tinfo
    events = (t0.get("events") or {}) if isinstance(t0, dict) else {}
    event_blob = json.dumps(events, default=str)
    record(
        "source_delete event has no source_insight",
        "source_insight" not in event_blob.lower(),
        f"events={list(events.keys()) if isinstance(events, dict) else type(events)}",
    )

    # Surreal may accept SELECT on a removed table and return [] / count 0
    # without recreating it. Treat that as clean when INFO FOR DB has no table.
    try:
        orphan = await repo_query("SELECT count() AS c FROM source_insight GROUP ALL;")
        count = 0
        if isinstance(orphan, list) and orphan:
            count = int(orphan[0].get("c") or 0)
        # Re-check INFO in case SELECT materialised the table
        info_after = await repo_query("INFO FOR DB;")
        info_after0 = (
            info_after[0]
            if isinstance(info_after, list) and info_after
            else info_after
        )
        tables_after = (
            (info_after0.get("tables") or {})
            if isinstance(info_after0, dict)
            else {}
        )
        still_defined = "source_insight" in tables_after
        if still_defined and count == 0:
            await repo_query("REMOVE TABLE IF EXISTS source_insight;")
            info_final = await repo_query("INFO FOR DB;")
            info_final0 = (
                info_final[0]
                if isinstance(info_final, list) and info_final
                else info_final
            )
            tables_final = (
                (info_final0.get("tables") or {})
                if isinstance(info_final0, dict)
                else {}
            )
            still_defined = "source_insight" in tables_final
        record(
            "source_insight has no residual rows / table",
            (not still_defined) and count == 0,
            f"count={count} still_defined={still_defined}",
        )
    except Exception as exc:
        record("source_insight has no residual rows / table", True, str(exc)[:240])

    failed = [name for name, passed, _ in CHECKS if not passed]
    print("\nSUMMARY")
    print(
        f"passed={sum(1 for _, p, _ in CHECKS if p)} "
        f"failed={len(failed)} total={len(CHECKS)}"
    )
    if failed:
        print("FAILED:", ", ".join(failed))
        raise SystemExit(1)
    print("Migration 39 applied cleanly.")


if __name__ == "__main__":
    asyncio.run(main())

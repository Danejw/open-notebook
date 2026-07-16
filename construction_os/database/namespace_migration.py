"""
Copy data from the legacy open_notebook Surreal namespace into construction_os.

Runs once when the app targets construction_os/construction_os and that database
is empty while the legacy open_notebook/open_notebook namespace still has data.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any, Optional

from loguru import logger
from surrealdb import AsyncSurreal

from construction_os.database.repository import (
    ensure_record_id,
    get_database_password,
    get_database_url,
    get_surreal_database,
    get_surreal_namespace,
    parse_record_ids,
)

LEGACY_NAMESPACE = "open_notebook"
LEGACY_DATABASE = "open_notebook"

RECORD_TABLES: tuple[str, ...] = (
    "construction_os",
    "command",
    "credential",
    "model",
    "episode_profile",
    "speaker_profile",
    "project",
    "source",
    "source_embedding",
    "note",
    "artifact",
    "episode",
    "chat_session",
    "chat_tool_call",
    "mcp_connection",
    "mcp_tool",
    "skill",
    "skill_file",
    "podcast_config",
)

RELATION_TABLES: tuple[str, ...] = (
    "project_note",
    "reference",
    "refers_to",
)


@asynccontextmanager
async def namespace_connection(namespace: str, database: str):
    db = AsyncSurreal(get_database_url())
    await db.signin(
        {
            "username": os.environ.get("SURREAL_USER"),
            "password": get_database_password(),
        }
    )
    await db.use(namespace, database)
    try:
        yield db
    finally:
        await db.close()


async def query_in_namespace(
    namespace: str,
    database: str,
    query_str: str,
    vars: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    async with namespace_connection(namespace, database) as connection:
        result = parse_record_ids(await connection.query(query_str, vars or {}))
        if isinstance(result, str):
            raise RuntimeError(result)
        if isinstance(result, list):
            return result
        return []


async def _table_count(namespace: str, database: str, table: str) -> int:
    try:
        rows = await query_in_namespace(
            namespace,
            database,
            f"SELECT count() AS count FROM {table} GROUP ALL",
        )
    except Exception:
        return 0
    if not rows:
        return 0
    return int(rows[0].get("count", 0))


KNOWN_RECORD_TABLES = frozenset(
    {
        "project",
        "source",
        "source_embedding",
        "note",
        "artifact",
        "credential",
        "model",
        "command",
        "episode",
        "episode_profile",
        "speaker_profile",
        "chat_session",
        "chat_tool_call",
        "mcp_connection",
        "mcp_tool",
        "skill",
        "skill_file",
        "construction_os",
        "open_notebook",
        "podcast_config",
        "_sbl_migrations",
    }
)

RECORD_LINK_FIELDS: dict[str, frozenset[str]] = {
    "source": frozenset({"command"}),
    "source_embedding": frozenset({"source"}),
    "skill_file": frozenset({"skill"}),
    "model": frozenset({"credential"}),
    "episode": frozenset({"command"}),
    "episode_profile": frozenset({"outline_llm", "transcript_llm"}),
    "speaker_profile": frozenset({"voice_model"}),
    "mcp_tool": frozenset({"connection"}),
}


def _normalize_record_data(table: str, data: dict[str, Any]) -> dict[str, Any]:
    link_fields = RECORD_LINK_FIELDS.get(table, frozenset())
    normalized: dict[str, Any] = {}
    for key, value in data.items():
        if key in link_fields and isinstance(value, str) and _looks_like_record_id(value):
            normalized[key] = ensure_record_id(value)
            continue
        if key == "speakers" and table == "speaker_profile" and isinstance(value, list):
            normalized[key] = [
                {
                    **speaker,
                    **(
                        {"voice_model": ensure_record_id(speaker["voice_model"])}
                        if isinstance(speaker.get("voice_model"), str)
                        and _looks_like_record_id(speaker["voice_model"])
                        else {}
                    ),
                }
                for speaker in value
                if isinstance(speaker, dict)
            ]
            continue
        normalized[key] = value
    return normalized


def _looks_like_record_id(value: str) -> bool:
    if ":" not in value or " " in value or value.startswith("http"):
        return False
    table_name, record_key = value.split(":", 1)
    return table_name in KNOWN_RECORD_TABLES and bool(record_key)


def _normalize_relation_endpoints(row: dict[str, Any]) -> tuple[Any, Any, dict[str, Any]]:
    source_id = row.get("in")
    target_id = row.get("out")
    if isinstance(source_id, str) and _looks_like_record_id(source_id):
        source_id = ensure_record_id(source_id)
    if isinstance(target_id, str) and _looks_like_record_id(target_id):
        target_id = ensure_record_id(target_id)
    edge_data = {key: value for key, value in row.items() if key not in ("id", "in", "out")}
    return source_id, target_id, edge_data


async def _copy_records(
    table: str,
    source_namespace: str,
    source_database: str,
    target_namespace: str,
    target_database: str,
) -> int:
    try:
        rows = await query_in_namespace(
            source_namespace, source_database, f"SELECT * FROM {table}"
        )
    except Exception as exc:
        logger.debug(f"Skipping table {table} during namespace copy: {exc}")
        return 0

    copied = 0
    failed = 0
    async with namespace_connection(target_namespace, target_database) as connection:
        for row in rows:
            record_id = row.get("id")
            if not record_id:
                continue
            data = {key: value for key, value in row.items() if key != "id"}
            data = _normalize_record_data(table, data)
            try:
                result = parse_record_ids(
                    await connection.query(
                        "UPSERT type::thing($id) CONTENT $data",
                        {"id": str(record_id), "data": data},
                    )
                )
                if isinstance(result, str):
                    raise RuntimeError(result)
                copied += 1
            except Exception as exc:
                failed += 1
                logger.warning(f"Could not copy {record_id} from {table}: {exc}")

    if copied:
        logger.info(f"Copied {copied} record(s) from {table}")
    if failed:
        logger.warning(f"Skipped {failed} record(s) from {table}")
    return copied


async def _copy_relations(
    table: str,
    source_namespace: str,
    source_database: str,
    target_namespace: str,
    target_database: str,
) -> int:
    try:
        rows = await query_in_namespace(
            source_namespace, source_database, f"SELECT * FROM {table}"
        )
    except Exception as exc:
        logger.debug(f"Skipping relation {table} during namespace copy: {exc}")
        return 0

    copied = 0
    failed = 0
    async with namespace_connection(target_namespace, target_database) as connection:
        for row in rows:
            source_id, target_id, edge_data = _normalize_relation_endpoints(row)
            if not source_id or not target_id:
                continue
            try:
                result = parse_record_ids(
                    await connection.query(
                        f"RELATE {source_id}->{table}->{target_id} CONTENT $data",
                        {"data": edge_data},
                    )
                )
                if isinstance(result, str):
                    raise RuntimeError(result)
                copied += 1
            except Exception as exc:
                failed += 1
                logger.warning(
                    f"Could not copy {table} edge {source_id}->{target_id}: {exc}"
                )

    if copied:
        logger.info(f"Copied {copied} relation(s) for {table}")
    if failed:
        logger.warning(f"Skipped {failed} relation(s) for {table}")
    return copied


async def _ensure_project_relation_schemas(namespace: str, database: str) -> None:
    """Ensure relation tables accept project endpoints before copying legacy edges."""
    await query_in_namespace(
        namespace,
        database,
        """
        DEFINE TABLE OVERWRITE reference
        TYPE RELATION
        FROM source TO project;

        DEFINE TABLE OVERWRITE refers_to
        TYPE RELATION
        FROM chat_session TO project|source;

        DEFINE TABLE IF NOT EXISTS project_note
        TYPE RELATION
        FROM note TO project;
        """,
    )


async def _clear_target_data(namespace: str, database: str) -> None:
    for table in (*reversed(RELATION_TABLES), *reversed(RECORD_TABLES)):
        try:
            await query_in_namespace(namespace, database, f"DELETE {table}")
        except Exception as exc:
            logger.debug(f"Could not clear {table} in target namespace: {exc}")


async def _needs_namespace_migration(
    target_namespace: str,
    target_database: str,
) -> bool:
    legacy_projects = await _table_count(LEGACY_NAMESPACE, LEGACY_DATABASE, "project")
    legacy_notebooks = await _table_count(LEGACY_NAMESPACE, LEGACY_DATABASE, "notebook")
    if legacy_projects == 0 and legacy_notebooks == 0:
        return False
    if legacy_notebooks > 0 and legacy_projects == 0:
        logger.warning(
            "Legacy namespace still has notebook records. "
            "Run rebrand migration against open_notebook before namespace copy."
        )
        return False

    target_projects = await _table_count(target_namespace, target_database, "project")
    target_sources = await _table_count(target_namespace, target_database, "source")
    target_models = await _table_count(target_namespace, target_database, "model")
    target_commands = await _table_count(target_namespace, target_database, "command")
    target_references = await _table_count(target_namespace, target_database, "reference")
    legacy_sources = await _table_count(LEGACY_NAMESPACE, LEGACY_DATABASE, "source")
    legacy_models = await _table_count(LEGACY_NAMESPACE, LEGACY_DATABASE, "model")
    legacy_commands = await _table_count(LEGACY_NAMESPACE, LEGACY_DATABASE, "command")
    legacy_references = await _table_count(LEGACY_NAMESPACE, LEGACY_DATABASE, "reference")

    if target_projects == 0:
        return True

    if (
        target_sources < legacy_sources
        or target_models < legacy_models
        or target_commands < legacy_commands
        or target_references < legacy_references
    ):
        logger.warning(
            "Partial namespace migration detected "
            f"(sources {target_sources}/{legacy_sources}, "
            f"models {target_models}/{legacy_models}, "
            f"commands {target_commands}/{legacy_commands}, "
            f"references {target_references}/{legacy_references}). "
            "Re-copying legacy data."
        )
        return True

    return False


async def migrate_legacy_namespace_if_needed() -> None:
    """Copy legacy open_notebook data into construction_os when target is empty."""
    target_namespace = get_surreal_namespace()
    target_database = get_surreal_database()

    if target_namespace != "construction_os" or target_database != "construction_os":
        logger.debug(
            "Namespace migration skipped: app not configured for construction_os/construction_os"
        )
        return

    if not await _needs_namespace_migration(target_namespace, target_database):
        logger.debug("Namespace migration skipped: construction_os is already populated")
        return

    target_sources = await _table_count(target_namespace, target_database, "source")
    target_models = await _table_count(target_namespace, target_database, "model")
    target_commands = await _table_count(target_namespace, target_database, "command")
    target_references = await _table_count(target_namespace, target_database, "reference")
    if (
        target_sources > 0
        or target_models > 0
        or target_commands > 0
        or target_references > 0
    ):
        await _clear_target_data(target_namespace, target_database)

    logger.info(
        "Copying data from open_notebook/open_notebook → construction_os/construction_os..."
    )

    total_records = 0
    for table in RECORD_TABLES:
        total_records += await _copy_records(
            table,
            LEGACY_NAMESPACE,
            LEGACY_DATABASE,
            target_namespace,
            target_database,
        )

    total_relations = 0
    await _ensure_project_relation_schemas(target_namespace, target_database)
    for table in RELATION_TABLES:
        total_relations += await _copy_relations(
            table,
            LEGACY_NAMESPACE,
            LEGACY_DATABASE,
            target_namespace,
            target_database,
        )

    logger.info(
        "Namespace migration complete "
        f"({total_records} records, {total_relations} relations copied)"
    )

    legacy_references = await _table_count(LEGACY_NAMESPACE, LEGACY_DATABASE, "reference")
    target_references = await _table_count(target_namespace, target_database, "reference")
    if legacy_references > 0 and target_references < legacy_references:
        raise RuntimeError(
            "Namespace migration incomplete: "
            f"copied {target_references}/{legacy_references} reference relations"
        )

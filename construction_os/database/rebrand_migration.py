"""
Construction OS rebrand data migrations (notebook→project, transformation→artifact).

Runs from API startup after SQL migrations 20–22. Idempotent: skips steps already applied.
"""

from __future__ import annotations

import re
from typing import Any

from loguru import logger

from construction_os.database.repository import repo_query, repo_relate, repo_update

NOTEBOOK_ID_RE = re.compile(r"notebook:[A-Za-z0-9_]+")

SINGLETON_SUFFIXES = (
    "default_models",
    "default_prompts",
    "provider_configs",
    "content_settings",
)

METADATA_TABLES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("episode", ("content", "briefing", "episode_profile", "speaker_profile", "transcript", "outline")),
    ("source", ("asset",)),
)


async def _table_exists(table_name: str) -> bool:
    try:
        result = await repo_query(f"INFO FOR TABLE {table_name}")
        return bool(result)
    except Exception:
        return False


async def _record_exists(record_id: str) -> bool:
    try:
        rows = await repo_query("SELECT id FROM ONLY type::thing($id)", {"id": record_id})
        return bool(rows)
    except Exception:
        return False


def _rewrite_notebook_ids(value: Any, id_map: dict[str, str]) -> Any:
    """Recursively replace notebook:* ID strings (and notebook_id keys) in nested data."""
    if isinstance(value, str):

        def _replace(match: re.Match[str]) -> str:
            return id_map.get(match.group(0), match.group(0))

        return NOTEBOOK_ID_RE.sub(_replace, value)
    if isinstance(value, dict):
        rewritten: dict[str, Any] = {}
        for key, item in value.items():
            new_key = "project_id" if key == "notebook_id" else key
            rewritten[new_key] = _rewrite_notebook_ids(item, id_map)
        return rewritten
    if isinstance(value, list):
        return [_rewrite_notebook_ids(item, id_map) for item in value]
    return value


async def _rewrite_json_metadata_notebook_ids(id_map: dict[str, str]) -> None:
    """Rewrite stored notebook:* strings inside JSON/metadata fields."""
    if not id_map:
        return

    updated_records = 0

    for table_name, fields in METADATA_TABLES:
        if not await _table_exists(table_name):
            continue

        rows = await repo_query(f"SELECT * FROM {table_name}")
        for row in rows:
            updates: dict[str, Any] = {}
            for field in fields:
                if field not in row or row[field] is None:
                    continue
                rewritten = _rewrite_notebook_ids(row[field], id_map)
                if rewritten != row[field]:
                    updates[field] = rewritten

            if not updates:
                continue

            await repo_update(table_name, str(row["id"]), updates)
            updated_records += 1

    if await _table_exists("chat_session"):
        sessions = await repo_query("SELECT * FROM chat_session")
        for session in sessions:
            updates: dict[str, Any] = {}
            for key, value in session.items():
                if key == "id":
                    continue
                rewritten = _rewrite_notebook_ids(value, id_map)
                if rewritten != value:
                    updates[key] = rewritten
            if updates:
                await repo_update("chat_session", str(session["id"]), updates)
                updated_records += 1

    if await _table_exists("command"):
        commands = await repo_query("SELECT * FROM command")
        for command in commands:
            updates: dict[str, Any] = {}
            for key, value in command.items():
                if key == "id":
                    continue
                rewritten = _rewrite_notebook_ids(value, id_map)
                if rewritten != value:
                    updates[key] = rewritten
            if updates:
                await repo_update("command", str(command["id"]), updates)
                updated_records += 1

    if updated_records:
        logger.info(
            f"Rewrote notebook:* metadata in {updated_records} record(s) across JSON fields"
        )


async def _remove_table_if_exists(table_name: str) -> None:
    if not await _table_exists(table_name):
        return
    try:
        await repo_query(f"REMOVE TABLE IF EXISTS {table_name}")
    except Exception as exc:
        logger.debug(f"Could not remove table {table_name}: {exc}")


async def _collect_orphan_notebook_ids() -> set[str]:
    orphan_ids: set[str] = set()

    if await _table_exists("reference"):
        for row in await repo_query("SELECT out FROM reference"):
            out = str(row.get("out", ""))
            if out.startswith("notebook:"):
                orphan_ids.add(out)

    if await _table_exists("refers_to"):
        for row in await repo_query("SELECT out FROM refers_to"):
            out = str(row.get("out", ""))
            if out.startswith("notebook:"):
                orphan_ids.add(out)

    return orphan_ids


async def _build_recovery_id_map(orphan_notebook_ids: set[str]) -> dict[str, str]:
    if not orphan_notebook_ids:
        return {}

    projects = await repo_query("SELECT id, name FROM project")
    if len(projects) == 1 and len(orphan_notebook_ids) == 1:
        notebook_id = next(iter(orphan_notebook_ids))
        return {notebook_id: str(projects[0]["id"])}

    raise RuntimeError(
        "Cannot recover notebook→project mapping automatically. "
        f"Found {len(orphan_notebook_ids)} legacy notebook reference(s) and "
        f"{len(projects)} project(s)."
    )


async def _retarget_notebook_relations(id_map: dict[str, str]) -> None:
    if not id_map:
        return

    await repo_query(
        """
        DEFINE TABLE OVERWRITE reference
        TYPE RELATION
        FROM source TO notebook|project;
        """
    )

    reference_edges = await repo_query("SELECT in, out FROM reference")
    for edge in reference_edges:
        source_id = str(edge["in"])
        old_out = str(edge["out"])
        new_out = id_map.get(old_out)
        if not new_out:
            continue
        await repo_query(
            """
            DELETE reference
            WHERE in = type::thing($source_id) AND out = type::thing($old_out);
            """,
            {"source_id": source_id, "old_out": old_out},
        )
        await repo_relate(source_id, "reference", new_out)

    await repo_query(
        """
        DEFINE TABLE OVERWRITE reference
        TYPE RELATION
        FROM source TO project;
        """
    )

    await repo_query(
        """
        DEFINE TABLE OVERWRITE refers_to
        TYPE RELATION
        FROM chat_session TO notebook|project|source;
        """
    )

    refers_edges = await repo_query("SELECT in, out FROM refers_to")
    for edge in refers_edges:
        session_id = str(edge["in"])
        old_out = str(edge["out"])
        new_out = id_map.get(old_out)
        if not new_out:
            continue
        await repo_query(
            """
            DELETE refers_to
            WHERE in = type::thing($session_id) AND out = type::thing($old_out);
            """,
            {"session_id": session_id, "old_out": old_out},
        )
        await repo_relate(session_id, "refers_to", new_out)

    await repo_query(
        """
        DEFINE TABLE OVERWRITE refers_to
        TYPE RELATION
        FROM chat_session TO project|source;
        """
    )


async def migrate_notebook_to_project() -> None:
    """Copy notebook records to project, remap relations, drop legacy tables."""
    notebook_table_exists = await _table_exists("notebook")
    notebooks = await repo_query("SELECT * FROM notebook") if notebook_table_exists else []
    orphan_notebook_ids = await _collect_orphan_notebook_ids()

    if not notebooks and not orphan_notebook_ids:
        logger.debug("No notebook records or legacy notebook references found; skipping migration")
        await _remove_table_if_exists("artifact")
        await _remove_table_if_exists("notebook")
        return

    id_map: dict[str, str] = {}

    if notebooks:
        logger.info("Starting notebook → project data migration...")
        for row in notebooks:
            old_id = str(row["id"])
            existing = await repo_query(
                """
                SELECT id FROM project
                WHERE name = $name
                  AND description = $description
                  AND archived = $archived
                LIMIT 1;
                """,
                {
                    "name": row.get("name"),
                    "description": row.get("description"),
                    "archived": row.get("archived", False),
                },
            )
            if existing:
                id_map[old_id] = str(existing[0]["id"])
                continue

            created = await repo_query(
                """
                CREATE project SET
                    name = $name,
                    description = $description,
                    archived = $archived,
                    created = $created,
                    updated = $updated;
                """,
                {
                    "name": row.get("name"),
                    "description": row.get("description"),
                    "archived": row.get("archived", False),
                    "created": row.get("created"),
                    "updated": row.get("updated"),
                },
            )
            if created and isinstance(created, list) and created:
                id_map[old_id] = str(created[0]["id"])
            elif created and isinstance(created, dict):
                id_map[old_id] = str(created["id"])
    else:
        logger.warning(
            "Recovering notebook → project migration from legacy references "
            f"({len(orphan_notebook_ids)} notebook id(s))"
        )
        id_map = await _build_recovery_id_map(orphan_notebook_ids)

    await repo_query(
        """
        DEFINE TABLE IF NOT EXISTS project_note
        TYPE RELATION
        FROM note TO project;
        """
    )

    if await _table_exists("artifact"):
        artifact_edges = await repo_query("SELECT in, out FROM artifact")
        for edge in artifact_edges:
            note_id = str(edge["in"])
            old_project = str(edge["out"])
            new_project = id_map.get(old_project)
            if new_project:
                existing_edge = await repo_query(
                    """
                    SELECT id FROM project_note
                    WHERE in = type::thing($note_id) AND out = type::thing($project_id)
                    LIMIT 1;
                    """,
                    {"note_id": note_id, "project_id": new_project},
                )
                if not existing_edge:
                    await repo_relate(note_id, "project_note", new_project)

    await _retarget_notebook_relations(id_map)
    await _rewrite_json_metadata_notebook_ids(id_map)

    await _remove_table_if_exists("artifact")
    await _remove_table_if_exists("notebook")

    logger.info(f"notebook → project migration complete ({len(id_map)} projects)")


async def _ensure_artifact_schema() -> None:
    await repo_query(
        """
        DEFINE TABLE OVERWRITE artifact SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS name ON TABLE artifact TYPE string;
        DEFINE FIELD IF NOT EXISTS title ON TABLE artifact TYPE string;
        DEFINE FIELD IF NOT EXISTS description ON TABLE artifact TYPE string;
        DEFINE FIELD IF NOT EXISTS prompt ON TABLE artifact TYPE string;
        DEFINE FIELD IF NOT EXISTS apply_default ON TABLE artifact TYPE bool DEFAULT False;
        DEFINE FIELD IF NOT EXISTS created ON artifact DEFAULT time::now() VALUE $before OR time::now();
        DEFINE FIELD IF NOT EXISTS updated ON artifact DEFAULT time::now() VALUE time::now();
        """
    )


async def migrate_transformation_to_artifact() -> None:
    """Copy transformation records to artifact table."""
    if not await _table_exists("transformation"):
        logger.debug("transformation table absent; migration skipped")
        await _ensure_artifact_schema()
        return

    try:
        rows = await repo_query("SELECT * FROM transformation")
    except RuntimeError as exc:
        if "does not exist" in str(exc).lower():
            logger.debug("transformation table unavailable during read; migration skipped")
            await _remove_table_if_exists("transformation")
            await _ensure_artifact_schema()
            return
        raise

    if not rows:
        logger.debug("transformation table empty; removing legacy table")
        await _remove_table_if_exists("transformation")
        await _ensure_artifact_schema()
        return

    logger.info("Starting transformation → artifact data migration...")
    await _ensure_artifact_schema()
    for row in rows:
        await repo_query(
            """
            CREATE artifact SET
                name = $name,
                title = $title,
                description = $description,
                prompt = $prompt,
                apply_default = $apply_default,
                created = $created,
                updated = $updated;
            """,
            {
                "name": row.get("name"),
                "title": row.get("title"),
                "description": row.get("description"),
                "prompt": row.get("prompt"),
                "apply_default": row.get("apply_default", False),
                "created": row.get("created"),
                "updated": row.get("updated"),
            },
        )

    await _remove_table_if_exists("transformation")
    logger.info(f"transformation → artifact migration complete ({len(rows)} artifacts)")


async def migrate_singleton_records() -> None:
    """Copy open_notebook:* singleton records to construction_os:*."""
    for suffix in SINGLETON_SUFFIXES:
        old_id = f"open_notebook:{suffix}"
        new_id = f"construction_os:{suffix}"

        old_rows = await repo_query("SELECT * FROM type::thing($id)", {"id": old_id})
        if not old_rows:
            continue

        data = {key: value for key, value in old_rows[0].items() if key != "id"}

        if "transformation_instructions" in data:
            data["artifact_instructions"] = data.pop("transformation_instructions")
        if "default_transformation_model" in data:
            data["default_artifact_model"] = data.pop("default_transformation_model")

        if not await _record_exists(new_id):
            await repo_query(
                "UPSERT type::thing($new_id) CONTENT $data",
                {"new_id": new_id, "data": data},
            )
            logger.info(f"Migrated singleton {old_id} → {new_id}")
        else:
            logger.debug(f"Singleton {new_id} already exists; removing legacy {old_id}")

        await repo_query("DELETE type::thing($id)", {"id": old_id})


async def seed_construction_artifacts() -> None:
    """Insert or backfill construction-industry artifact templates."""
    from construction_os.database.construction_artifact_templates import (
        CONSTRUCTION_ARTIFACT_TEMPLATES,
    )
    from construction_os.database.repository import repo_create, repo_query, repo_update

    await repo_query(
        """
        UPSERT construction_os:default_prompts CONTENT {
            artifact_instructions: "# INSTRUCTIONS\\n\\nYou are a construction industry analyst helping estimators, project managers, and field teams extract actionable information from project documents (specs, drawings, RFQs, submittals, contracts, schedules).\\n\\n# IMPORTANT\\n- Output ONLY the requested content.\\n- Use construction terminology accurately.\\n- Flag assumptions and missing information explicitly.\\n- Do not stop mid-task to ask questions."
        };
        """
    )

    created = 0
    backfilled = 0
    for template in CONSTRUCTION_ARTIFACT_TEMPLATES:
        existing = await repo_query(
            "SELECT id FROM artifact WHERE name = $name LIMIT 1",
            {"name": template["name"]},
        )
        if not existing:
            payload = {
                "name": template["name"],
                "title": template["title"],
                "description": template["description"],
                "prompt": template["prompt"],
                "apply_default": template["apply_default"],
            }
            created_record = await repo_create("artifact", payload)
            created += 1
            record_id = None
            if isinstance(created_record, list) and created_record:
                record_id = created_record[0].get("id")
            elif isinstance(created_record, dict):
                record_id = created_record.get("id")
            if record_id and template.get("lifecycle_phase"):
                try:
                    await repo_update(
                        "artifact",
                        record_id,
                        {"lifecycle_phase": template["lifecycle_phase"]},
                    )
                except Exception as exc:
                    logger.warning(
                        f"Could not set lifecycle_phase for {template['name']}: {exc}"
                    )
            continue

        record = existing[0]
        if not template.get("lifecycle_phase"):
            continue

        try:
            phase_rows = await repo_query(
                "SELECT lifecycle_phase FROM artifact WHERE id = $id LIMIT 1",
                {"id": record["id"]},
            )
            current_phase = phase_rows[0].get("lifecycle_phase") if phase_rows else None
        except Exception:
            current_phase = None

        if current_phase != template["lifecycle_phase"]:
            try:
                await repo_update(
                    "artifact",
                    record["id"],
                    {"lifecycle_phase": template["lifecycle_phase"]},
                )
                backfilled += 1
            except Exception as exc:
                logger.warning(
                    f"Could not backfill lifecycle_phase for {template['name']}: {exc}"
                )

    if created or backfilled:
        logger.info(
            f"Construction artifacts: {created} created, {backfilled} lifecycle phases backfilled"
        )
    else:
        logger.debug("Construction artifact templates already up to date")


async def run_construction_os_rebrand() -> None:
    """Run all Construction OS rebrand data migrations in order."""
    await migrate_notebook_to_project()
    await migrate_transformation_to_artifact()
    await migrate_singleton_records()
    await seed_construction_artifacts()

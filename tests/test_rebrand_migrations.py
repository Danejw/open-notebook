"""Tests for Construction OS rebrand migrations (20-22) and ID rewriting."""

import inspect
from pathlib import Path

from construction_os.database import rebrand_migration
from construction_os.database.construction_artifact_templates import (
    CONSTRUCTION_ARTIFACT_NAMES,
    CONSTRUCTION_ARTIFACT_TEMPLATES,
    LIFECYCLE_PHASES,
)
from construction_os.database.rebrand_migration import _rewrite_notebook_ids

MIGRATIONS_DIR = (
    Path(__file__).resolve().parent.parent
    / "construction_os"
    / "database"
    / "migrations"
)


class TestRebrandMigrationFiles:
    """SQL migration artifacts for notebook→project and transformation→artifact."""

    @staticmethod
    def _migration_paths(version: int) -> tuple[Path, Path]:
        return (
            MIGRATIONS_DIR / f"{version}.surrealql",
            MIGRATIONS_DIR / f"{version}_down.surrealql",
        )

    def test_migration_20_files_exist(self):
        up, down = self._migration_paths(20)
        assert up.is_file()
        assert down.is_file()
        assert "DEFINE TABLE IF NOT EXISTS project" in up.read_text(encoding="utf-8")

    def test_migration_21_files_exist(self):
        up, down = self._migration_paths(21)
        assert up.is_file()
        assert down.is_file()
        assert "artifact" in up.read_text(encoding="utf-8").lower()

    def test_migration_22_files_exist(self):
        up, down = self._migration_paths(22)
        assert up.is_file()
        assert down.is_file()
        up_sql = up.read_text(encoding="utf-8")
        # Migration 22 must contain executable SQL (not comments-only) for version bump.
        stripped = "\n".join(
            line for line in up_sql.splitlines() if line.strip() and not line.strip().startswith("--")
        )
        assert stripped.strip()

    def test_migration_23_files_exist(self):
        up, down = self._migration_paths(23)
        assert up.is_file()
        assert down.is_file()
        up_sql = up.read_text(encoding="utf-8")
        assert "reference" in up_sql.lower()
        assert "project" in up_sql.lower()

    def test_migration_24_files_exist(self):
        up, down = self._migration_paths(24)
        assert up.is_file()
        assert down.is_file()
        up_sql = up.read_text(encoding="utf-8")
        assert "lifecycle_phase" in up_sql

    def test_migration_20_retarges_reference_to_project(self):
        up = self._migration_paths(20)[0]
        up_sql = up.read_text(encoding="utf-8")
        assert "FROM source TO project" in up_sql


class TestConstructionArtifactSeeds:
    def test_construction_artifact_templates_cover_lifecycle(self):
        assert len(CONSTRUCTION_ARTIFACT_TEMPLATES) == 57
        assert len(CONSTRUCTION_ARTIFACT_NAMES) == 57
        assert len(set(CONSTRUCTION_ARTIFACT_NAMES)) == 57
        assert len(LIFECYCLE_PHASES) == 6

    def test_seed_construction_artifacts_uses_shared_templates(self):
        source = inspect.getsource(rebrand_migration.seed_construction_artifacts)
        assert "CONSTRUCTION_ARTIFACT_TEMPLATES" in source
        for name in CONSTRUCTION_ARTIFACT_NAMES[:8]:
            assert any(
                template["name"] == name for template in CONSTRUCTION_ARTIFACT_TEMPLATES
            )

    def test_ensure_artifact_schema_preserves_chat_defaults(self):
        """Rebrand schema ensure must not wipe chat-default fields on SCHEMAFULL artifact."""
        source = inspect.getsource(rebrand_migration._ensure_artifact_schema)
        assert "DEFINE TABLE OVERWRITE artifact" not in source
        assert "DEFINE TABLE IF NOT EXISTS artifact" in source
        for field in (
            "lifecycle_phase",
            "skill_ids",
            "collection_ids",
            "mcp_tool_ids",
            "html_template_id",
        ):
            assert field in source, f"missing DEFINE FIELD for {field}"

    def test_notebook_migration_does_not_drop_artifact_templates(self):
        """Skip/cleanup paths must not REMOVE the post-rebrand artifact template table."""
        source = inspect.getsource(rebrand_migration.migrate_notebook_to_project)
        assert "_remove_legacy_artifact_relation_table" in source
        assert '_remove_table_if_exists("artifact")' not in source
        helper = inspect.getsource(rebrand_migration._is_legacy_artifact_relation_table)
        assert "prompt" in helper
        assert '"in"' in helper or "'in'" in helper


class TestRewriteNotebookIds:
    def test_rewrites_notebook_id_strings(self):
        id_map = {"notebook:abc": "project:abc"}
        assert _rewrite_notebook_ids("notebook:abc", id_map) == "project:abc"

    def test_rewrites_notebook_id_keys(self):
        id_map = {"notebook:abc": "project:abc"}
        payload = {"notebook_id": "notebook:abc", "title": "RFQ"}
        assert _rewrite_notebook_ids(payload, id_map) == {
            "project_id": "project:abc",
            "title": "RFQ",
        }

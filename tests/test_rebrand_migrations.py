"""Tests for Construction OS rebrand migrations (20-22) and ID rewriting."""

import inspect
from pathlib import Path

from construction_os.database import rebrand_migration
from construction_os.database.rebrand_migration import _rewrite_notebook_ids

CONSTRUCTION_ARTIFACT_NAMES = (
    "Bid Scope Summary",
    "Quantity Takeoff Extract",
    "Cost & Pricing Risks",
    "Schedule & Milestones",
    "RFQ / RFP Requirements Extract",
    "Submittal / Spec Compliance",
    "Change-Order Impact",
    "Safety & Code Checklist",
)

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

    def test_migration_20_retarges_reference_to_project(self):
        up = self._migration_paths(20)[0]
        up_sql = up.read_text(encoding="utf-8")
        assert "FROM source TO project" in up_sql


class TestConstructionArtifactSeeds:
    def test_seed_construction_artifacts_defines_eight_templates(self):
        source = inspect.getsource(rebrand_migration.seed_construction_artifacts)
        for name in CONSTRUCTION_ARTIFACT_NAMES:
            assert name in source
        assert source.count('"name":') >= 8


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

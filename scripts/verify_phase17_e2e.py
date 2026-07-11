"""Phase 17 end-to-end verification against a live SurrealDB instance.

Covers checklist items 17.3–17.7, 17.10, and 17.11 using an isolated
namespace so production data is untouched.
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Any
from unittest.mock import AsyncMock, patch

os.environ.setdefault("SURREAL_URL", "ws://localhost:8000/rpc")
os.environ.setdefault("SURREAL_USER", "root")
os.environ.setdefault("SURREAL_PASSWORD", "root")
os.environ.setdefault("CONSTRUCTION_OS_ENCRYPTION_KEY", "phase17-test-encryption-key")
os.environ.setdefault("CONSTRUCTION_OS_PASSWORD", "")

TEST_NS = "construction_os_phase17_e2e"
TEST_DB = "construction_os_phase17_e2e"

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


async def setup_test_database() -> None:
    """Run migrations 1–22 and rebrand seeds in the test namespace."""
    from construction_os.database.async_migrate import AsyncMigrationManager
    from construction_os.database.rebrand_migration import run_construction_os_rebrand

    os.environ["SURREAL_NAMESPACE"] = TEST_NS
    os.environ["SURREAL_DATABASE"] = TEST_DB

    manager = AsyncMigrationManager()
    await manager.run_migration_up()
    await run_construction_os_rebrand()


async def test_project_source_artifact_insight_flow() -> dict[str, Any]:
    """17.3 — Create project, attach source, simulate artifact insight."""
    from construction_os.database.repository import db_connection, ensure_record_id, repo_query
    from construction_os.domain.artifact import Artifact
    from construction_os.domain.project import Project, Source

    result: dict[str, Any] = {"ok": False}

    async with db_connection():
        project = Project(name="Phase17 RFQ Project", description="E2E test project")
        await project.save()
        project_id = str(project.id)

        source = Source(
            title="Bid Package Spec",
            full_text="Concrete slab 4000 PSI. Bid due March 15. Bond required.",
        )
        await source.save()
        source_id = str(source.id)
        await source.add_to_project(project_id)

        artifacts = await Artifact.get_all(order_by="name asc")
        bid_scope = next((a for a in artifacts if a.name == "Bid Scope Summary"), None)
        result["artifact_list_count"] = len(artifacts)
        result["bid_scope_found"] = bid_scope is not None

        insight_rows = await repo_query(
            """
            CREATE source_insight CONTENT {
                source: $source_id,
                insight_type: $insight_type,
                content: $content
            };
            """,
            {
                "source_id": ensure_record_id(source_id),
                "insight_type": "Bid Scope Summary",
                "content": "Scope: concrete slab, bond required, bid date March 15.",
            },
        )
        insight_id = str(insight_rows[0]["id"])

        source_insights = await Source.get(source_id)
        insights = await source_insights.get_insights()  # type: ignore[union-attr]

    result["project_id"] = project_id
    result["source_id"] = source_id
    result["insight_id"] = insight_id
    result["insight_count"] = len(insights)
    result["ok"] = (
        bool(project_id)
        and bool(source_id)
        and bid_scope is not None
        and len(insights) >= 1
    )
    return result


async def test_save_insight_as_note_with_project_note(insight_id: str, project_id: str) -> dict[str, Any]:
    """17.4 — Save insight as note linked via project_note."""
    from construction_os.database.repository import db_connection, repo_query
    from construction_os.domain.project import SourceInsight

    result: dict[str, Any] = {"ok": False}

    async with db_connection():
        insight = await SourceInsight.get(insight_id)
        note = await insight.save_as_note(project_id)
        note_id = str(note.id)

        edges = await repo_query(
            """
            SELECT in, out FROM project_note
            WHERE in = type::thing($note_id) AND out = type::thing($project_id);
            """,
            {"note_id": note_id, "project_id": project_id},
        )

    result["note_id"] = note_id
    result["project_note_edges"] = len(edges)
    result["ok"] = len(edges) == 1
    return result


async def test_project_chat_session_with_skills(project_id: str) -> dict[str, Any]:
    """17.5 — Chat session accepts project_id and skill_ids (Skills/Tools wiring)."""
    from construction_os.database.repository import db_connection, repo_query
    from construction_os.domain.project import ChatSession

    result: dict[str, Any] = {"ok": False}
    skill_ids = ["skill:estimation", "skill:scheduling"]

    async with db_connection():
        session = ChatSession(title="Phase17 chat", skill_ids=skill_ids)
        await session.save()
        await session.relate_to_project(project_id)
        session_id = str(session.id)

        refers = await repo_query(
            """
            SELECT out FROM refers_to
            WHERE in = type::thing($session_id);
            """,
            {"session_id": session_id},
        )

    result["session_id"] = session_id
    result["refers_to_project"] = any(str(r.get("out", "")) == project_id for r in refers)
    result["skill_ids"] = skill_ids
    result["ok"] = result["refers_to_project"]
    return result


async def test_search_and_save_to_projects(note_id: str, project_id: str) -> dict[str, Any]:
    """17.6 — Text search finds content; note is associated with project."""
    from construction_os.database.repository import db_connection, repo_query
    from construction_os.domain.project import Note, text_search

    result: dict[str, Any] = {"ok": False}

    async with db_connection():
        search_hits = await text_search("concrete slab", results=10, source=True, note=True)
        note = await Note.get(note_id)
        projects_for_note = await repo_query(
            """
            SELECT out FROM project_note WHERE in = type::thing($note_id);
            """,
            {"note_id": note_id},
        )

    result["search_hit_count"] = len(search_hits) if search_hits else 0
    result["note_linked_projects"] = [str(p["out"]) for p in projects_for_note]
    result["ok"] = result["search_hit_count"] >= 1 and project_id in result["note_linked_projects"]
    return result


async def test_podcast_generation_from_project(project_id: str) -> dict[str, Any]:
    """17.7 — Podcast job accepts project_id (mocked job submission)."""
    from fastapi.testclient import TestClient

    from api.main import app

    result: dict[str, Any] = {"ok": False}

    with patch(
        "api.routers.podcasts.PodcastService.submit_generation_job",
        new_callable=AsyncMock,
        return_value="command:podcast-phase17",
    ) as mock_submit:
        client = TestClient(app)
        response = client.post(
            "/api/podcasts/generate",
            json={
                "episode_profile": "default",
                "speaker_profile": "default",
                "episode_name": "Phase17 Episode",
                "project_id": project_id,
                "content": "Bid scope summary for concrete work.",
            },
        )

    result["status_code"] = response.status_code
    result["response"] = response.json() if response.status_code == 200 else response.text
    if mock_submit.await_count:
        result["submitted_project_id"] = mock_submit.await_args.kwargs.get("project_id")
    result["ok"] = response.status_code == 200 and result.get("submitted_project_id") == project_id
    return result


async def test_construction_default_artifacts() -> dict[str, Any]:
    """17.10 — Eight construction default artifacts seeded."""
    from construction_os.database.repository import db_connection, repo_query

    result: dict[str, Any] = {"ok": False, "found": [], "missing": []}

    async with db_connection():
        rows = await repo_query("SELECT name FROM artifact ORDER BY name ASC")
        names = {row["name"] for row in rows}
        for expected in CONSTRUCTION_ARTIFACT_NAMES:
            if expected in names:
                result["found"].append(expected)
            else:
                result["missing"].append(expected)

        prompts = await repo_query("SELECT artifact_instructions FROM construction_os:default_prompts")
        result["has_artifact_instructions"] = bool(
            prompts and prompts[0].get("artifact_instructions")
        )

    result["artifact_count"] = len(result["found"])
    result["ok"] = (
        len(result["missing"]) == 0
        and result["artifact_count"] == 8
        and result["has_artifact_instructions"]
    )
    return result


async def test_construction_os_env_boot() -> dict[str, Any]:
    """17.11 — CONSTRUCTION_OS_* env vars and construction_os namespace."""
    from construction_os.database.repository import get_surreal_database, get_surreal_namespace
    from construction_os.utils.env import get_env

    from fastapi.testclient import TestClient

    from api.main import app

    result: dict[str, Any] = {"ok": False}

    enc = get_env("CONSTRUCTION_OS_ENCRYPTION_KEY")
    namespace = get_surreal_namespace()
    database = get_surreal_database()

    client = TestClient(app)
    health = client.get("/health")
    artifacts_resp = client.get("/api/artifacts")

    result["encryption_key_set"] = bool(enc)
    result["namespace"] = namespace
    result["database"] = database
    result["health_status"] = health.status_code
    result["artifacts_status"] = artifacts_resp.status_code
    result["artifacts_count"] = len(artifacts_resp.json()) if artifacts_resp.status_code == 200 else 0
    result["ok"] = (
        result["encryption_key_set"]
        and namespace == TEST_NS
        and database == TEST_DB
        and health.status_code == 200
        and artifacts_resp.status_code == 200
        and result["artifacts_count"] >= 8
    )
    return result


async def main() -> int:
    print("=== Phase 17 E2E verification ===\n")
    print(f"Using namespace/database: {TEST_NS}\n")

    results: dict[str, bool] = {}

    try:
        print("Setting up test database (migrations + rebrand)...")
        await setup_test_database()
        print("  setup: OK\n")
    except Exception as exc:
        print(f"  setup FAILED: {exc}\n")
        return 1

    flow = await test_project_source_artifact_insight_flow()
    print("17.3 Project → Source → Artifact insight:")
    for k, v in flow.items():
        print(f"  {k}: {v}")
    results["17.3"] = flow["ok"]
    print()

    note_flow = await test_save_insight_as_note_with_project_note(
        flow["insight_id"], flow["project_id"]
    )
    print("17.4 Save insight as note (project_note):")
    for k, v in note_flow.items():
        print(f"  {k}: {v}")
    results["17.4"] = note_flow["ok"]
    print()

    chat_flow = await test_project_chat_session_with_skills(flow["project_id"])
    print("17.5 Project chat session + Skills:")
    for k, v in chat_flow.items():
        print(f"  {k}: {v}")
    results["17.5"] = chat_flow["ok"]
    print()

    search_flow = await test_search_and_save_to_projects(
        note_flow["note_id"], flow["project_id"]
    )
    print("17.6 Search + Save to Projects:")
    for k, v in search_flow.items():
        print(f"  {k}: {v}")
    results["17.6"] = search_flow["ok"]
    print()

    podcast_flow = await test_podcast_generation_from_project(flow["project_id"])
    print("17.7 Podcast from project context:")
    for k, v in podcast_flow.items():
        print(f"  {k}: {v}")
    results["17.7"] = podcast_flow["ok"]
    print()

    artifacts_flow = await test_construction_default_artifacts()
    print("17.10 Construction default artifacts:")
    for k, v in artifacts_flow.items():
        print(f"  {k}: {v}")
    results["17.10"] = artifacts_flow["ok"]
    print()

    env_flow = await test_construction_os_env_boot()
    print("17.11 CONSTRUCTION_OS_* boot:")
    for k, v in env_flow.items():
        print(f"  {k}: {v}")
    results["17.11"] = env_flow["ok"]
    print()

    print("=== Summary ===")
    for item, ok in results.items():
        print(f"  {item}: {'PASS' if ok else 'FAIL'}")

    all_ok = all(results.values())
    print(f"\nOverall: {'PASS' if all_ok else 'FAIL'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

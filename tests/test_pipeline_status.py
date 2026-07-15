"""Tests for source ingestion pipeline status reconciliation."""

from unittest.mock import AsyncMock

import pytest

from construction_os.knowledge.pipeline import (
    PIPELINE_COMPLETED,
    PIPELINE_EMBEDDING,
    PIPELINE_FAILED,
    PIPELINE_KNOWLEDGE_GRAPH,
    clear_pipeline_failure,
    fetched_command_status,
    record_pipeline_failure,
    resolve_processing_failures,
    resolve_pipeline_status,
    sanitize_processing_error,
)


class TestResolvePipelineStatus:
    def test_extract_queued_preferred(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="queued",
            pipeline_stage=PIPELINE_EMBEDDING,
            has_embed_command=True,
            embed_command_status="new",
        )
        assert status == "queued"
        assert stage == PIPELINE_EMBEDDING

    def test_embedding_with_failed_child(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="completed",
            pipeline_stage=PIPELINE_EMBEDDING,
            has_embed_command=True,
            embed_command_status="failed",
        )
        assert status == "failed"
        assert stage == PIPELINE_FAILED

    def test_embedding_with_running_child(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="completed",
            pipeline_stage=PIPELINE_EMBEDDING,
            has_embed_command=True,
            embed_command_status="running",
        )
        assert status == "running"
        assert stage == PIPELINE_EMBEDDING

    def test_embedding_without_child_is_failed(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="completed",
            pipeline_stage=PIPELINE_EMBEDDING,
            has_embed_command=False,
            embed_command_status=None,
        )
        assert status == "failed"
        assert stage == PIPELINE_FAILED

    def test_knowledge_graph_without_child_is_failed(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="completed",
            pipeline_stage=PIPELINE_KNOWLEDGE_GRAPH,
            has_kg_command=False,
        )
        assert status == "failed"
        assert stage == PIPELINE_FAILED

    def test_knowledge_graph_failed_child(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="completed",
            pipeline_stage=PIPELINE_KNOWLEDGE_GRAPH,
            has_kg_command=True,
            kg_command_status="failed",
        )
        assert status == "failed"
        assert stage == PIPELINE_FAILED

    def test_completed_pipeline(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="completed",
            pipeline_stage=PIPELINE_COMPLETED,
        )
        assert status == "completed"
        assert stage == PIPELINE_COMPLETED

    def test_extract_failed(self):
        status, stage, _msg = resolve_pipeline_status(
            extract_status="failed",
            pipeline_stage="extracting",
        )
        assert status == "failed"
        assert stage == PIPELINE_FAILED


class TestFetchedCommandStatus:
    def test_missing(self):
        status, present = fetched_command_status(None)
        assert status is None
        assert present is False

    def test_dict(self):
        status, present = fetched_command_status({"id": "command:1", "status": "running"})
        assert status == "running"
        assert present is True

    def test_unresolved_ref(self):
        status, present = fetched_command_status("command:1")
        assert status == "unknown"
        assert present is True


def test_sanitize_processing_error_redacts_credentials_and_bounds_text():
    message = (
        "Authorization: Bearer secret-token "
        "postgres://admin:hunter2@db.example/jobs?"
        "X-Amz-Signature=signed-value&api_key=super-secret "
        + ("x" * 2000)
    )

    result = sanitize_processing_error(message)

    assert "secret-token" not in result
    assert "super-secret" not in result
    assert "hunter2" not in result
    assert "signed-value" not in result
    assert "[REDACTED]" in result
    assert len(result) <= 1000


@pytest.mark.asyncio
async def test_record_pipeline_failure_writes_typed_stage_snapshot(monkeypatch):
    repo_query = AsyncMock()
    monkeypatch.setattr("construction_os.knowledge.pipeline.repo_query", repo_query)

    snapshot = await record_pipeline_failure(
        "source:abc",
        PIPELINE_EMBEDDING,
        RuntimeError("provider unavailable"),
        command_id="command:embed",
    )

    assert snapshot["stage"] == PIPELINE_EMBEDDING
    assert snapshot["message"] == "provider unavailable"
    assert snapshot["error_type"] == "RuntimeError"
    assert snapshot["command_id"] == "command:embed"
    assert snapshot["occurred_at"]
    repo_query.assert_awaited_once()
    assert "processing_failures[$stage]" in repo_query.await_args.args[0]


@pytest.mark.asyncio
async def test_clear_pipeline_failure_unsets_only_requested_stage(monkeypatch):
    repo_query = AsyncMock()
    monkeypatch.setattr("construction_os.knowledge.pipeline.repo_query", repo_query)

    await clear_pipeline_failure("source:abc", PIPELINE_KNOWLEDGE_GRAPH)

    repo_query.assert_awaited_once()
    assert (
        "UNSET processing_failures.knowledge_graph"
        in repo_query.await_args.args[0]
    )
    assert "stage" not in repo_query.await_args.args[1]


def test_resolve_processing_failures_prefers_persisted_snapshot():
    persisted = {
        "embedding": {
            "stage": "embedding",
            "message": "persisted reason",
            "occurred_at": "2026-07-14T00:00:00+00:00",
        }
    }

    result = resolve_processing_failures(
        persisted,
        embed_command={
            "id": "command:old",
            "status": "failed",
            "error_message": "older command reason",
        },
    )

    assert result["embedding"]["message"] == "persisted reason"


def test_resolve_processing_failures_reads_embed_result_error():
    result = resolve_processing_failures(
        {},
        embed_command={
            "id": "command:embed",
            "status": "completed",
            "updated": "2026-07-14T00:00:00Z",
            "result": {
                "success": False,
                "error_message": "embedding provider rejected batch",
            },
        },
    )

    assert result["embedding"] == {
        "stage": "embedding",
        "message": "embedding provider rejected batch",
        "error_type": None,
        "occurred_at": "2026-07-14T00:00:00Z",
        "command_id": "command:embed",
    }


def test_resolve_processing_failures_reads_latest_failed_kg_run():
    result = resolve_processing_failures(
        {},
        kg_run={
            "status": "failed",
            "error_message": "empty extraction",
            "finished_at": "2026-07-14T01:00:00Z",
            "command_id": "command:kg",
        },
    )

    assert result["knowledge_graph"]["message"] == "empty extraction"
    assert result["knowledge_graph"]["command_id"] == "command:kg"


def test_resolve_processing_failures_prefers_richer_kg_run_over_command():
    result = resolve_processing_failures(
        {},
        kg_command={
            "id": "command:kg",
            "status": "failed",
            "error_message": "generic command failure",
        },
        kg_run={
            "status": "failed",
            "error_message": "extractor returned no entities",
            "error_type": "ValueError",
            "finished_at": "2026-07-14T01:00:00Z",
            "command_id": "command:kg",
        },
    )

    assert result["knowledge_graph"]["message"] == "extractor returned no entities"
    assert result["knowledge_graph"]["error_type"] == "ValueError"

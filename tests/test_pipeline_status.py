"""Tests for source ingestion pipeline status reconciliation."""

from construction_os.knowledge.pipeline import (
    PIPELINE_COMPLETED,
    PIPELINE_EMBEDDING,
    PIPELINE_FAILED,
    PIPELINE_KNOWLEDGE_GRAPH,
    fetched_command_status,
    resolve_pipeline_status,
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

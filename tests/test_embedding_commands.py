from unittest.mock import AsyncMock, MagicMock

import pytest
from surreal_commands import registry

import commands
import commands.embedding_commands as embedding_commands
from construction_os.exceptions import ConfigurationError


def test_legacy_embedding_commands_are_registered():
    app_commands = registry.list_commands()["construction_os"]

    assert "embed_chunk" in app_commands
    assert "embed_single_item" in app_commands
    assert "vectorize_source" in app_commands


@pytest.mark.asyncio
async def test_legacy_embed_chunk_processes_stale_queue_payload(monkeypatch):
    mock_generate_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
    mock_repo_query = AsyncMock()

    monkeypatch.setattr(
        embedding_commands, "generate_embedding", mock_generate_embedding
    )
    monkeypatch.setattr(embedding_commands, "repo_query", mock_repo_query)
    monkeypatch.setattr(
        embedding_commands, "ensure_record_id", lambda value: f"record:{value}"
    )

    result = await embedding_commands.legacy_embed_chunk_command(
        embedding_commands.LegacyEmbedChunkInput(
            source_id="source:abc",
            chunk_index=2,
            chunk_text="queued legacy chunk",
        )
    )

    assert result.success is True
    assert result.source_id == "source:abc"
    assert result.chunk_index == 2
    mock_generate_embedding.assert_awaited_once_with(
        "queued legacy chunk",
        content_type=embedding_commands.ContentType.PLAIN,
        command_id="unknown",
    )
    mock_repo_query.assert_awaited_once()
    assert mock_repo_query.await_args is not None
    assert mock_repo_query.await_args.args[1] == {
        "source_id": "record:source:abc",
        "order": 2,
        "content": "queued legacy chunk",
        "embedding": [0.1, 0.2, 0.3],
    }


@pytest.mark.asyncio
async def test_legacy_vectorize_source_delegates_to_embed_source(monkeypatch):
    async def fake_embed_source(input_data):
        assert input_data.source_id == "source:abc"
        return embedding_commands.EmbedSourceOutput(
            success=True,
            source_id=input_data.source_id,
            chunks_created=3,
            processing_time=0.1,
        )

    monkeypatch.setattr(embedding_commands, "embed_source_command", fake_embed_source)

    result = await embedding_commands.legacy_vectorize_source_command(
        embedding_commands.LegacyVectorizeSourceInput(source_id="source:abc")
    )

    assert result.success is True
    assert result.source_id == "source:abc"
    assert result.total_chunks == 3
    assert result.jobs_submitted == 1


@pytest.mark.asyncio
async def test_embed_source_runtime_error_fails_pipeline_without_raise(monkeypatch):
    source = MagicMock()
    source.full_text = "hello world"
    source.asset = None

    fail_pipeline = AsyncMock()
    monkeypatch.setattr(embedding_commands, "fail_pipeline", fail_pipeline)
    monkeypatch.setattr(
        embedding_commands.Source, "get", AsyncMock(return_value=source)
    )
    monkeypatch.setattr(
        embedding_commands, "detect_content_type", lambda *_a, **_k: embedding_commands.ContentType.PLAIN
    )
    monkeypatch.setattr(embedding_commands, "chunk_text", lambda *_a, **_k: ["hello world"])
    monkeypatch.setattr(
        embedding_commands,
        "generate_embeddings",
        AsyncMock(side_effect=RuntimeError("provider down")),
    )
    monkeypatch.setattr(embedding_commands, "repo_query", AsyncMock())
    monkeypatch.setattr(embedding_commands, "repo_insert", AsyncMock())
    monkeypatch.setattr(embedding_commands, "begin_kg_stage", AsyncMock())

    result = await embedding_commands.embed_source_command(
        embedding_commands.EmbedSourceInput(source_id="source:abc")
    )

    assert result.success is False
    assert "provider down" in (result.error_message or "")
    fail_pipeline.assert_awaited_once_with("source:abc")


@pytest.mark.asyncio
async def test_embed_source_configuration_error_fails_pipeline(monkeypatch):
    source = MagicMock()
    source.full_text = "hello world"
    source.asset = None

    fail_pipeline = AsyncMock()
    monkeypatch.setattr(embedding_commands, "fail_pipeline", fail_pipeline)
    monkeypatch.setattr(
        embedding_commands.Source, "get", AsyncMock(return_value=source)
    )
    monkeypatch.setattr(
        embedding_commands, "detect_content_type", lambda *_a, **_k: embedding_commands.ContentType.PLAIN
    )
    monkeypatch.setattr(embedding_commands, "chunk_text", lambda *_a, **_k: ["hello world"])
    monkeypatch.setattr(
        embedding_commands,
        "generate_embeddings",
        AsyncMock(side_effect=ConfigurationError("bad model")),
    )

    result = await embedding_commands.embed_source_command(
        embedding_commands.EmbedSourceInput(source_id="source:abc")
    )

    assert result.success is False
    fail_pipeline.assert_awaited_once_with("source:abc")


@pytest.mark.asyncio
async def test_embed_source_success_begins_kg(monkeypatch):
    source = MagicMock()
    source.full_text = "hello world"
    source.asset = None

    begin_kg = AsyncMock(return_value="command:kg")
    monkeypatch.setattr(embedding_commands, "begin_kg_stage", begin_kg)
    monkeypatch.setattr(
        embedding_commands.Source, "get", AsyncMock(return_value=source)
    )
    monkeypatch.setattr(
        embedding_commands, "detect_content_type", lambda *_a, **_k: embedding_commands.ContentType.PLAIN
    )
    monkeypatch.setattr(embedding_commands, "chunk_text", lambda *_a, **_k: ["hello world"])
    monkeypatch.setattr(
        embedding_commands,
        "generate_embeddings",
        AsyncMock(return_value=[[0.1, 0.2]]),
    )
    monkeypatch.setattr(embedding_commands, "repo_query", AsyncMock())
    monkeypatch.setattr(embedding_commands, "repo_insert", AsyncMock())
    monkeypatch.setattr(
        embedding_commands,
        "resolve_project_ids_for_source",
        AsyncMock(return_value=["project:1"]),
    )

    result = await embedding_commands.embed_source_command(
        embedding_commands.EmbedSourceInput(source_id="source:abc")
    )

    assert result.success is True
    assert result.chunks_created == 1
    begin_kg.assert_awaited_once_with("source:abc", ["project:1"])


@pytest.mark.asyncio
async def test_legacy_embed_single_item_routes_insights(monkeypatch):
    async def fake_embed_insight(input_data):
        assert input_data.insight_id == "source_insight:abc"
        return embedding_commands.EmbedInsightOutput(
            success=True,
            insight_id=input_data.insight_id,
            processing_time=0.1,
        )

    monkeypatch.setattr(embedding_commands, "embed_insight_command", fake_embed_insight)

    result = await embedding_commands.legacy_embed_single_item_command(
        embedding_commands.LegacyEmbedSingleItemInput(
            item_id="source_insight:abc",
            item_type="insight",
        )
    )

    assert result.success is True
    assert result.item_id == "source_insight:abc"
    assert result.item_type == "insight"
    assert result.chunks_created == 0

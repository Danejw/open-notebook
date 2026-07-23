"""Unit tests for project artifact create helpers and model default lookup."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from construction_os.ai.models import ModelManager
from construction_os.exceptions import ConfigurationError
from construction_os.services.project_artifacts import (
    create_project_artifact,
    fallback_artifact_title,
    generate_artifact_title,
)


class TestFallbackArtifactTitle:
    def test_uses_first_words(self):
        content = "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu"
        title = fallback_artifact_title(content)
        assert title == "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu…"

    def test_short_content_unchanged(self):
        assert fallback_artifact_title("Short title") == "Short title"

    def test_empty_content(self):
        assert fallback_artifact_title("   ") == "Untitled Artifact"


class TestGenerateArtifactTitle:
    @pytest.mark.asyncio
    async def test_falls_back_when_prompt_graph_fails(self):
        mock_graph = MagicMock()
        mock_graph.ainvoke = AsyncMock(
            side_effect=ConfigurationError(
                "No model configured for default for type=artifact"
            )
        )
        with patch("construction_os.graphs.prompt.graph", mock_graph):
            title = await generate_artifact_title(
                "Kitchen renovation scope and bid package details",
                "generated",
            )
        assert title == "Kitchen renovation scope and bid package details"


class TestCreateProjectArtifactTitleFallback:
    @pytest.mark.asyncio
    async def test_create_succeeds_when_title_generation_fails(self):
        content = "Kitchen renovation scope and bid package details"
        captured: dict[str, object] = {}

        def _make_artifact(**kwargs: object) -> AsyncMock:
            captured.update(kwargs)
            mock_artifact = AsyncMock()
            mock_artifact.id = "note:fallback1"
            mock_artifact.title = kwargs.get("title")
            mock_artifact.content = kwargs.get("content")
            mock_artifact.note_type = kwargs.get("note_type")
            mock_artifact.artifact_kind = kwargs.get("note_type")
            mock_artifact.created = "2026-01-01T00:00:00Z"
            mock_artifact.updated = "2026-01-01T00:00:00Z"
            mock_artifact.save = AsyncMock(return_value=None)
            mock_artifact.add_to_project = AsyncMock()
            return mock_artifact

        mock_graph = MagicMock()
        mock_graph.ainvoke = AsyncMock(
            side_effect=ConfigurationError("No model configured")
        )

        with (
            patch("construction_os.graphs.prompt.graph", mock_graph),
            patch(
                "construction_os.services.project_artifacts.ProjectArtifact",
                side_effect=_make_artifact,
            ),
        ):
            result = await create_project_artifact(
                content=content,
                artifact_kind="generated",
            )

        assert result["id"] == "note:fallback1"
        assert captured["title"] == content
        assert result["title"] == content


class TestGetDefaultModelArtifactCase:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("model_type", ["artifact", "Artifact", "ARTIFACT"])
    async def test_artifact_type_is_case_insensitive(self, model_type: str):
        manager = ModelManager()
        defaults = MagicMock()
        defaults.default_artifact_model = None
        defaults.default_chat_model = "model:chat-default"
        fake_model = MagicMock()

        with (
            patch.object(manager, "get_defaults", AsyncMock(return_value=defaults)),
            patch.object(
                manager, "get_model", AsyncMock(return_value=fake_model)
            ) as mock_get_model,
        ):
            result = await manager.get_default_model(model_type)

        assert result is fake_model
        mock_get_model.assert_awaited_once_with("model:chat-default")

    @pytest.mark.asyncio
    async def test_prefers_explicit_artifact_default(self):
        manager = ModelManager()
        defaults = MagicMock()
        defaults.default_artifact_model = "model:artifact-default"
        defaults.default_chat_model = "model:chat-default"
        fake_model = MagicMock()

        with (
            patch.object(manager, "get_defaults", AsyncMock(return_value=defaults)),
            patch.object(
                manager, "get_model", AsyncMock(return_value=fake_model)
            ) as mock_get_model,
        ):
            result = await manager.get_default_model("artifact")

        assert result is fake_model
        mock_get_model.assert_awaited_once_with("model:artifact-default")

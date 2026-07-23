from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client after environment variables have been cleared by conftest."""
    from api.main import app

    return TestClient(app)


class TestSearchLimitValidation:
    """SearchRequest.limit must reject non-positive values (#863)."""

    @pytest.mark.parametrize("bad_limit", [0, -1, -100])
    def test_non_positive_limit_returns_422(self, bad_limit, client):
        response = client.post(
            "/api/search",
            json={"query": "x", "type": "text", "limit": bad_limit},
        )
        assert response.status_code == 422

    def test_limit_above_max_returns_422(self, client):
        response = client.post(
            "/api/search",
            json={"query": "x", "type": "text", "limit": 1001},
        )
        assert response.status_code == 422

    @patch("api.routers.search.text_search", new_callable=AsyncMock)
    def test_valid_limit_returns_200(self, mock_text_search, client):
        mock_text_search.return_value = []
        response = client.post(
            "/api/search",
            json={"query": "x", "type": "text", "limit": 10},
        )
        assert response.status_code == 200
        mock_text_search.assert_awaited_once()


class TestSearchModeRouting:
    """RAG-005: vector stays pure; hybrid/auto go through retrieve()."""

    @patch("api.routers.search.model_manager.get_embedding_model", new_callable=AsyncMock)
    @patch("api.routers.search.vector_search", new_callable=AsyncMock)
    @patch("api.routers.search.retrieve", new_callable=AsyncMock)
    def test_vector_uses_vector_search_not_retrieve(
        self, mock_retrieve, mock_vector_search, mock_get_model, client
    ):
        mock_get_model.return_value = object()
        mock_vector_search.return_value = [{"id": "source:1"}]
        response = client.post(
            "/api/search",
            json={"query": "roof warranty", "type": "vector", "limit": 5},
        )
        assert response.status_code == 200
        mock_vector_search.assert_awaited_once()
        mock_retrieve.assert_not_awaited()
        body = response.json()
        assert body["search_type"] == "vector"
        assert body.get("retrieval_mode_used") is None

    @patch("api.routers.search.model_manager.get_embedding_model", new_callable=AsyncMock)
    @patch("api.routers.search.vector_search", new_callable=AsyncMock)
    @patch("api.routers.search.retrieve", new_callable=AsyncMock)
    def test_hybrid_uses_retrieve(
        self, mock_retrieve, mock_vector_search, mock_get_model, client
    ):
        mock_get_model.return_value = object()
        bundle = MagicMock()
        bundle.to_search_results.return_value = [{"id": "source:1"}]
        bundle.retrieval_mode_used = "hybrid"
        bundle.embedding_dim_warning = None
        mock_retrieve.return_value = bundle
        response = client.post(
            "/api/search",
            json={"query": "roof warranty", "type": "hybrid", "limit": 5},
        )
        assert response.status_code == 200
        mock_retrieve.assert_awaited_once()
        assert mock_retrieve.await_args.kwargs["mode"] == "hybrid"
        mock_vector_search.assert_not_awaited()
        assert response.json()["retrieval_mode_used"] == "hybrid"

    @patch("api.routers.search.model_manager.get_embedding_model", new_callable=AsyncMock)
    @patch("api.routers.search.vector_search", new_callable=AsyncMock)
    @patch("api.routers.search.retrieve", new_callable=AsyncMock)
    def test_auto_uses_retrieve_auto_mode(
        self, mock_retrieve, mock_vector_search, mock_get_model, client
    ):
        mock_get_model.return_value = object()
        bundle = MagicMock()
        bundle.to_search_results.return_value = [{"id": "source:1"}]
        bundle.retrieval_mode_used = "hybrid"
        bundle.embedding_dim_warning = None
        mock_retrieve.return_value = bundle
        response = client.post(
            "/api/search",
            json={"query": "detail 3/A-501", "type": "auto", "limit": 5},
        )
        assert response.status_code == 200
        mock_retrieve.assert_awaited_once()
        assert mock_retrieve.await_args.kwargs["mode"] == "auto"
        mock_vector_search.assert_not_awaited()
        body = response.json()
        assert body["search_type"] == "auto"
        assert body["retrieval_mode_used"] == "hybrid"

    @patch("api.routers.search.model_manager.get_embedding_model", new_callable=AsyncMock)
    @patch("api.routers.search.vector_search", new_callable=AsyncMock)
    @patch("api.routers.search.retrieve", new_callable=AsyncMock)
    def test_omitted_type_defaults_to_auto_like_chat(
        self, mock_retrieve, mock_vector_search, mock_get_model, client
    ):
        """RAG-014: default SearchRequest.type matches chat retrieve(mode='auto')."""
        mock_get_model.return_value = object()
        bundle = MagicMock()
        bundle.to_search_results.return_value = [{"id": "source:1"}]
        bundle.retrieval_mode_used = "vector"
        bundle.embedding_dim_warning = None
        mock_retrieve.return_value = bundle
        response = client.post(
            "/api/search",
            json={"query": "roof warranty", "limit": 5},
        )
        assert response.status_code == 200
        mock_retrieve.assert_awaited_once()
        assert mock_retrieve.await_args.kwargs["mode"] == "auto"
        mock_vector_search.assert_not_awaited()
        body = response.json()
        assert body["search_type"] == "auto"
        assert body["retrieval_mode_used"] == "vector"


class TestTextSearchHighlightOverflowFallback:
    """text_search() must fall back to vector search on a highlight position overflow (#648)."""

    @pytest.mark.asyncio
    async def test_position_overflow_falls_back_to_vector_search(self):
        import construction_os.domain.search as search_module

        overflow = RuntimeError(
            "A value can't be highlighted: position overflow: 2545 - len: 1965"
        )
        with (
            patch.object(
                search_module, "repo_query", new_callable=AsyncMock, side_effect=overflow
            ),
            patch.object(
                search_module,
                "vector_search",
                new_callable=AsyncMock,
                return_value=[{"id": "source:1"}],
            ) as mock_vector,
        ):
            result = await search_module.text_search("hello", 10)

        assert result == [{"id": "source:1"}]
        mock_vector.assert_awaited_once_with(
            "hello", 10, True, True, project_id=None
        )

    @pytest.mark.asyncio
    async def test_position_overflow_raises_when_vector_also_fails(self):
        import construction_os.domain.search as search_module
        from construction_os.exceptions import DatabaseOperationError

        overflow = RuntimeError("position overflow: 1 - len: 0")
        with (
            patch.object(
                search_module, "repo_query", new_callable=AsyncMock, side_effect=overflow
            ),
            patch.object(
                search_module,
                "vector_search",
                new_callable=AsyncMock,
                side_effect=Exception("no embedding model"),
            ),
        ):
            # When both search paths fail, surface the error rather than masking it
            # as an empty result set.
            with pytest.raises(DatabaseOperationError):
                await search_module.text_search("hello", 10)

    @pytest.mark.asyncio
    async def test_other_runtime_errors_still_raise(self):
        import construction_os.domain.search as search_module
        from construction_os.exceptions import DatabaseOperationError

        with patch.object(
            search_module,
            "repo_query",
            new_callable=AsyncMock,
            side_effect=RuntimeError("some other db failure"),
        ):
            with pytest.raises(DatabaseOperationError):
                await search_module.text_search("hello", 10)

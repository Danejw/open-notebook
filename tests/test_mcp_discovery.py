"""Integration tests for MCP tool discovery sync."""

from __future__ import annotations

import pytest

from construction_os.domain.mcp import McpConnection, McpTool
from construction_os.mcp.discovery import sync_tools
from construction_os.mcp.url_safety import validate_mcp_url
from tests.fixtures.fake_mcp_server import FakeMcpServer


@pytest.fixture
def allow_private(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS", "true")


@pytest.mark.asyncio
async def test_sync_marks_missing_tools_unavailable(allow_private):
    """Sync upserts tools and marks removed catalog entries unavailable."""
    with FakeMcpServer() as server:
        url = validate_mcp_url(server.url)
        conn = McpConnection(
            name="Fake",
            endpoint_url=url,
            auth_type="none",
            status="unknown",
        )
        try:
            await conn.save()
        except Exception:
            pytest.skip("SurrealDB not available for integration test")

        tools = await sync_tools(conn)
        assert any(t.name == "echo" for t in tools)
        echo = await McpTool.find_by_connection_and_name(conn.id, "echo")
        assert echo is not None
        assert echo.available is True
        assert echo.risk_level == "read"

        server.state.tools = [t for t in server.state.tools if t["name"] != "echo"]
        await sync_tools(conn)
        echo = await McpTool.find_by_connection_and_name(conn.id, "echo")
        assert echo is not None
        assert echo.available is False

        try:
            await conn.delete()
        except Exception:
            pass

"""Tests for MCP Streamable HTTP transport against the fake server."""

from __future__ import annotations

import pytest

from open_notebook.mcp.client import McpClient
from open_notebook.mcp.transport import (
    McpTransportError,
    parse_mcp_http_body,
    parse_sse_jsonrpc,
)
from tests.fixtures.fake_mcp_server import FakeMcpServer


@pytest.fixture
def fake_mcp(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPEN_NOTEBOOK_MCP_ALLOW_PRIVATE_URLS", "true")
    with FakeMcpServer() as server:
        yield server


@pytest.mark.asyncio
async def test_initialize_and_list_tools(fake_mcp: FakeMcpServer) -> None:
    client = McpClient(fake_mcp.url)
    await client.connect()
    assert client.session_id == "sess-1"
    assert client.server_info and client.server_info["name"] == "fake-mcp"
    tools = await client.list_tools()
    names = {t["name"] for t in tools}
    assert "echo" in names
    assert client.session_id == "sess-1"


@pytest.mark.asyncio
async def test_call_tool_echo(fake_mcp: FakeMcpServer) -> None:
    client = McpClient(fake_mcp.url)
    await client.connect()
    result = await client.call_tool("echo", {"text": "hi"})
    assert result.get("isError") is False
    assert result["content"][0]["text"] == "hi"
    assert fake_mcp.state.call_log[-1]["name"] == "echo"


@pytest.mark.asyncio
async def test_sse_response(fake_mcp: FakeMcpServer) -> None:
    fake_mcp.state.use_sse = True
    client = McpClient(fake_mcp.url)
    await client.connect()
    tools = await client.list_tools()
    assert any(t["name"] == "echo" for t in tools)


@pytest.mark.asyncio
async def test_bearer_required(fake_mcp: FakeMcpServer) -> None:
    fake_mcp.state.require_bearer = "secret-token"
    client = McpClient(fake_mcp.url, bearer_token="secret-token")
    await client.connect()
    tools = await client.list_tools()
    assert tools

    bad = McpClient(fake_mcp.url, bearer_token="wrong")
    with pytest.raises(McpTransportError):
        await bad.connect()


@pytest.mark.asyncio
async def test_timeout(fake_mcp: FakeMcpServer) -> None:
    fake_mcp.state.delay_seconds = 2.0
    client = McpClient(fake_mcp.url, timeout_seconds=0.2)
    with pytest.raises(McpTransportError, match="timed out"):
        await client.connect()


@pytest.mark.asyncio
async def test_malformed_response(fake_mcp: FakeMcpServer) -> None:
    client = McpClient(fake_mcp.url)
    await client.connect()
    fake_mcp.state.malformed = True
    with pytest.raises(McpTransportError):
        await client.list_tools()


def test_parse_json_array() -> None:
    body = b'[{"jsonrpc":"2.0","id":1,"result":{"ok":true}}]'
    msgs = parse_mcp_http_body(body, "application/json")
    assert msgs[0]["result"]["ok"] is True


def test_parse_sse() -> None:
    text = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"a":1}}\n\n'
    msgs = parse_sse_jsonrpc(text)
    assert msgs[0]["result"]["a"] == 1

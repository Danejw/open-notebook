"""Tests for MCP URL / SSRF validation."""

from __future__ import annotations


import pytest

from construction_os.mcp.url_safety import McpUrlError, validate_mcp_url


def test_accepts_public_https(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS", raising=False)
    # Use example.com — public; avoid DNS dependency by using literal if needed
    url = validate_mcp_url("https://example.com/mcp")
    assert url == "https://example.com/mcp"


def test_rejects_non_http_scheme() -> None:
    with pytest.raises(McpUrlError, match="http or https"):
        validate_mcp_url("ftp://example.com/mcp")


def test_rejects_embedded_credentials() -> None:
    with pytest.raises(McpUrlError, match="embedded credentials"):
        validate_mcp_url("https://user:pass@example.com/mcp")


def test_rejects_loopback_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS", raising=False)
    with pytest.raises(McpUrlError, match="Private or loopback"):
        validate_mcp_url("http://127.0.0.1:3000/mcp")


def test_rejects_private_ip_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS", raising=False)
    with pytest.raises(McpUrlError, match="Private or loopback"):
        validate_mcp_url("http://10.0.0.5/mcp")


def test_rejects_metadata_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS", raising=False)
    with pytest.raises(McpUrlError, match="Private or loopback"):
        validate_mcp_url("http://169.254.169.254/latest/meta-data")


def test_allows_private_when_flag_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CONSTRUCTION_OS_MCP_ALLOW_PRIVATE_URLS", "true")
    url = validate_mcp_url("http://127.0.0.1:8765/mcp")
    assert url.startswith("http://127.0.0.1:8765")


def test_strips_fragment() -> None:
    url = validate_mcp_url("https://example.com/mcp#section")
    assert "#" not in url

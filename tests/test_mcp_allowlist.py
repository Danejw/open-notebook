"""Tests for MCP allowlist aliases and duplicate-call guard."""

from open_notebook.mcp.allowlist import make_runtime_name
from open_notebook.mcp.execution import DuplicateCallGuard


def test_runtime_name_includes_connection_identity() -> None:
    a = make_runtime_name("mcp_connection:abc123xyz", "echo")
    b = make_runtime_name("mcp_connection:def456uvw", "echo")
    assert a != b
    assert a.startswith("mcp__")
    assert "echo" in a


def test_duplicate_call_guard() -> None:
    guard = DuplicateCallGuard()
    assert guard.check_and_record("tool_a", {"x": 1}) is False
    assert guard.check_and_record("tool_a", {"x": 1}) is True
    assert guard.check_and_record("tool_a", {"x": 2}) is False
    assert guard.check_and_record("tool_b", {"x": 1}) is False

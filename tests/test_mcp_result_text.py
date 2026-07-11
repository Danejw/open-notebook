"""Tests for MCP result text bounding."""

from open_notebook.mcp.result_text import bound_error_message, mcp_result_to_text


def test_extracts_text_content() -> None:
    result = {
        "content": [{"type": "text", "text": "hello world"}],
        "isError": False,
    }
    assert mcp_result_to_text(result) == "hello world"


def test_marks_mcp_error() -> None:
    result = {
        "content": [{"type": "text", "text": "boom"}],
        "isError": True,
    }
    text = mcp_result_to_text(result)
    assert "error" in text.lower()
    assert "boom" in text


def test_non_text_content() -> None:
    result = {"content": [{"type": "image", "mimeType": "image/png"}]}
    assert "non-text" in mcp_result_to_text(result)


def test_truncation() -> None:
    result = {"content": [{"type": "text", "text": "x" * 5000}]}
    text = mcp_result_to_text(result, max_chars=100)
    assert len(text) <= 100
    assert "truncated" in text


def test_redacts_bearer_in_errors() -> None:
    msg = bound_error_message("Authorization: Bearer secret-token-value failed")
    assert "secret-token" not in msg
    assert "redacted" in msg.lower() or "failed" in msg.lower()

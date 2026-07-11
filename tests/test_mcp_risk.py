"""Tests for MCP tool risk classification."""

from open_notebook.mcp.risk import classify_tool_risk


def test_readonly_annotation() -> None:
    assert (
        classify_tool_risk("write_file", annotations={"readOnlyHint": True}) == "read"
    )


def test_destructive_annotation() -> None:
    assert (
        classify_tool_risk("anything", annotations={"destructiveHint": True})
        == "action"
    )


def test_infer_read_from_name() -> None:
    assert classify_tool_risk("list_files", "List files in a directory") == "read"


def test_infer_action_from_name() -> None:
    assert classify_tool_risk("delete_file", "Delete a file") == "action"


def test_unknown_when_unclear() -> None:
    assert classify_tool_risk("process", "Does something useful") == "unknown"


def test_readOnly_false_is_action() -> None:
    assert classify_tool_risk("x", annotations={"readOnlyHint": False}) == "action"

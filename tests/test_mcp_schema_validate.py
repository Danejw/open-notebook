"""Tests for MCP argument schema validation."""

import pytest

from open_notebook.mcp.schema_validate import (
    McpArgumentValidationError,
    validate_tool_arguments,
)


SCHEMA = {
    "type": "object",
    "required": ["path"],
    "properties": {
        "path": {"type": "string"},
        "limit": {"type": "integer"},
        "flag": {"type": "boolean"},
    },
}


def test_valid_arguments() -> None:
    args = validate_tool_arguments({"path": "/tmp", "limit": 3}, SCHEMA)
    assert args["path"] == "/tmp"


def test_rejects_non_object() -> None:
    with pytest.raises(McpArgumentValidationError, match="object"):
        validate_tool_arguments(["nope"], SCHEMA)


def test_missing_required() -> None:
    with pytest.raises(McpArgumentValidationError, match="Missing required"):
        validate_tool_arguments({}, SCHEMA)


def test_wrong_type() -> None:
    with pytest.raises(McpArgumentValidationError, match="invalid type"):
        validate_tool_arguments({"path": 123}, SCHEMA)


def test_empty_schema_allows_object() -> None:
    assert validate_tool_arguments({"a": 1}, None) == {"a": 1}

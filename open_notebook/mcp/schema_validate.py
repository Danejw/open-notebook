"""Validate tool arguments against a discovered JSON Schema (subset)."""

from __future__ import annotations

from typing import Any, Mapping, Optional


class McpArgumentValidationError(ValueError):
    """Raised when tool arguments fail schema validation."""


_TYPE_MAP = {
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "object": dict,
    "array": list,
    "null": type(None),
}


def validate_tool_arguments(
    arguments: Any,
    input_schema: Optional[Mapping[str, Any]],
) -> dict[str, Any]:
    """
    Validate arguments against a JSON Schema object (basic subset).

    Does not mutate or silently repair arguments. Returns the original
    dict when valid.
    """
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        raise McpArgumentValidationError("Tool arguments must be an object")

    if not input_schema:
        return arguments

    schema_type = input_schema.get("type", "object")
    if schema_type != "object":
        # Only object roots are expected for MCP tool inputs
        raise McpArgumentValidationError("Tool input schema must be an object")

    required = input_schema.get("required") or []
    if not isinstance(required, list):
        required = []

    properties = input_schema.get("properties") or {}
    if not isinstance(properties, dict):
        properties = {}

    for key in required:
        if key not in arguments:
            raise McpArgumentValidationError(f"Missing required property: {key}")

    for key, value in arguments.items():
        prop_schema = properties.get(key)
        if not isinstance(prop_schema, dict):
            continue
        _validate_value(key, value, prop_schema)

    return arguments


def _validate_value(key: str, value: Any, schema: Mapping[str, Any]) -> None:
    expected = schema.get("type")
    if expected is None:
        return
    types = expected if isinstance(expected, list) else [expected]
    if "null" in types and value is None:
        return
    ok = False
    for t in types:
        py = _TYPE_MAP.get(t)
        if py is None:
            ok = True
            break
        if isinstance(value, py) and not (
            t == "number" and isinstance(value, bool)
        ):
            # bool is subclass of int — reject bool for number/integer
            if t in {"number", "integer"} and isinstance(value, bool):
                continue
            if t == "integer" and isinstance(value, bool):
                continue
            if t == "integer" and isinstance(value, int) and not isinstance(value, bool):
                ok = True
                break
            if t != "integer":
                ok = True
                break
    if not ok:
        raise McpArgumentValidationError(
            f"Property '{key}' has invalid type (expected {expected})"
        )

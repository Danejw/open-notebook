"""Deterministic MCP tool risk classification."""

from __future__ import annotations

from typing import Any, Literal, Mapping, Optional

RiskLevel = Literal["read", "action", "unknown"]

_READ_NAME_HINTS = (
    "get",
    "list",
    "read",
    "fetch",
    "search",
    "find",
    "query",
    "show",
    "describe",
    "lookup",
    "count",
    "stat",
    "head",
)
_ACTION_NAME_HINTS = (
    "create",
    "update",
    "delete",
    "remove",
    "write",
    "put",
    "post",
    "patch",
    "send",
    "execute",
    "run",
    "call",
    "set",
    "move",
    "rename",
    "upload",
    "publish",
    "destroy",
    "drop",
    "insert",
    "mutate",
)


def classify_tool_risk(
    name: str,
    description: Optional[str] = None,
    annotations: Optional[Mapping[str, Any]] = None,
) -> RiskLevel:
    """
    Classify tool risk using MCP annotations first, then conservative inference.

    Risk is informational for authorization except that v1 only executes `read`.
    """
    ann = annotations or {}
    if ann.get("readOnlyHint") is True:
        return "read"
    if ann.get("destructiveHint") is True:
        return "action"
    # openWorldHint alone is not enough; combined with non-readOnly → action
    if ann.get("readOnlyHint") is False:
        return "action"

    lowered = (name or "").lower()
    desc = (description or "").lower()
    combined = f"{lowered} {desc}"

    action_hit = any(
        hint in lowered.split("_")
        or hint in lowered.split("-")
        or f" {hint} " in f" {combined} "
        or lowered.startswith(hint)
        for hint in _ACTION_NAME_HINTS
    )
    read_hit = any(
        hint in lowered.split("_")
        or hint in lowered.split("-")
        or lowered.startswith(hint)
        for hint in _READ_NAME_HINTS
    )

    if action_hit and not read_hit:
        return "action"
    if read_hit and not action_hit:
        return "read"
    if action_hit and read_hit:
        # Prefer action when mixed (conservative)
        return "action"
    return "unknown"

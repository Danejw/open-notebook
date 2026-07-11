"""Safe public representations for MCP entities (no secrets)."""

from __future__ import annotations

from typing import Any, Mapping, Optional


def connection_has_auth_config(auth_config: Any) -> bool:
    """Return True when encrypted/auth config appears present."""
    if not auth_config:
        return False
    if isinstance(auth_config, dict):
        token = auth_config.get("token") or auth_config.get("bearer_token")
        return bool(token)
    if isinstance(auth_config, str):
        return bool(auth_config.strip())
    return True


def public_connection(
    row: Mapping[str, Any],
    *,
    available_tool_count: Optional[int] = None,
) -> dict[str, Any]:
    """Build a client-safe connection dict (never includes tokens)."""
    auth_config = row.get("auth_config")
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "endpoint_url": row.get("endpoint_url"),
        "transport": row.get("transport") or "streamable_http",
        "auth_type": row.get("auth_type") or "none",
        "has_auth_config": connection_has_auth_config(auth_config),
        "status": row.get("status") or "unknown",
        "server_info": row.get("server_info"),
        "capabilities": row.get("capabilities"),
        "last_connected_at": row.get("last_connected_at"),
        "last_synced_at": row.get("last_synced_at"),
        "last_error": row.get("last_error"),
        "available_tool_count": available_tool_count,
        "owner": row.get("owner"),
        "created": row.get("created"),
        "updated": row.get("updated"),
    }


def public_tool(
    row: Mapping[str, Any],
    *,
    connection_name: Optional[str] = None,
    executable: Optional[bool] = None,
) -> dict[str, Any]:
    """Build a client-safe tool dict."""
    risk = row.get("risk_level") or "unknown"
    available = bool(row.get("available", True))
    if executable is None:
        executable = available and risk == "read"
    return {
        "id": row.get("id"),
        "connection_id": _record_to_str(row.get("connection")),
        "connection_name": connection_name,
        "name": row.get("name"),
        "title": row.get("title"),
        "description": row.get("description"),
        "input_schema": row.get("input_schema"),
        "output_schema": row.get("output_schema"),
        "annotations": row.get("annotations"),
        "risk_level": risk,
        "available": available,
        "executable": executable,
        "last_discovered_at": row.get("last_discovered_at"),
        "created": row.get("created"),
        "updated": row.get("updated"),
    }


def public_tool_call(row: Mapping[str, Any]) -> dict[str, Any]:
    """Build a client-safe audit tool-call dict (bounded result_text, no huge raw)."""
    return {
        "id": row.get("id"),
        "session_id": row.get("session_id"),
        "message_id": row.get("message_id"),
        "connection_id": row.get("connection_id"),
        "tool_id": row.get("tool_id"),
        "tool_name": row.get("tool_name"),
        "connection_name": row.get("connection_name"),
        "risk_level": row.get("risk_level"),
        "runtime_name": row.get("runtime_name"),
        "arguments": row.get("arguments"),
        "result_text": row.get("result_text"),
        "status": row.get("status"),
        "error": row.get("error"),
        "created": row.get("created"),
        "updated": row.get("updated"),
    }


def _record_to_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(value)

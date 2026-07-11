"""MCP connection and tool service layer."""

from __future__ import annotations

from typing import List, Optional

from loguru import logger

from api.credentials_service import require_encryption_key
from api.mcp_models import (
    ChatToolCallResponse,
    McpConnectionAuthUpdateRequest,
    McpConnectionCreateRequest,
    McpConnectionResponse,
    McpToolResponse,
)
from open_notebook.domain.mcp import ChatToolCall, McpConnection, McpTool
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.mcp.discovery import sync_tools, test_connection
from open_notebook.mcp.public import public_connection, public_tool, public_tool_call
from open_notebook.mcp.url_safety import McpUrlError, validate_mcp_url


def _to_connection_response(
    conn: McpConnection, available_tool_count: Optional[int] = None
) -> McpConnectionResponse:
    data = public_connection(
        {
            "id": str(conn.id),
            "name": conn.name,
            "endpoint_url": conn.endpoint_url,
            "transport": conn.transport,
            "auth_type": conn.auth_type,
            "auth_config": conn.auth_config,
            "status": conn.status,
            "server_info": conn.server_info,
            "capabilities": conn.capabilities,
            "last_connected_at": conn.last_connected_at,
            "last_synced_at": conn.last_synced_at,
            "last_error": conn.last_error,
            "owner": conn.owner,
            "created": str(conn.created) if conn.created else None,
            "updated": str(conn.updated) if conn.updated else None,
        },
        available_tool_count=available_tool_count,
    )
    return McpConnectionResponse(**data)


def _to_tool_response(
    tool: McpTool, connection_name: Optional[str] = None
) -> McpToolResponse:
    data = public_tool(
        {
            "id": str(tool.id),
            "connection": str(tool.connection),
            "name": tool.name,
            "title": tool.title,
            "description": tool.description,
            "input_schema": tool.input_schema,
            "output_schema": tool.output_schema,
            "annotations": tool.annotations,
            "risk_level": tool.risk_level,
            "available": tool.available,
            "last_discovered_at": tool.last_discovered_at,
            "created": str(tool.created) if tool.created else None,
            "updated": str(tool.updated) if tool.updated else None,
        },
        connection_name=connection_name,
    )
    return McpToolResponse(**data)


async def list_connections() -> List[McpConnectionResponse]:
    connections = await McpConnection.get_all(order_by="name asc")
    out: List[McpConnectionResponse] = []
    for conn in connections:
        tools = await McpTool.get_by_connection(str(conn.id))
        available = sum(1 for t in tools if t.available)
        out.append(_to_connection_response(conn, available_tool_count=available))
    return out


async def get_connection(connection_id: str) -> McpConnectionResponse:
    try:
        conn = await McpConnection.get(connection_id)
    except Exception as e:
        raise NotFoundError(f"MCP connection not found: {connection_id}") from e
    tools = await McpTool.get_by_connection(str(conn.id))
    available = sum(1 for t in tools if t.available)
    return _to_connection_response(conn, available_tool_count=available)


async def create_connection(body: McpConnectionCreateRequest) -> McpConnectionResponse:
    try:
        url = validate_mcp_url(body.endpoint_url)
    except McpUrlError as e:
        raise InvalidInputError(str(e)) from e

    if body.auth_type == "bearer":
        require_encryption_key()
        if not body.bearer_token:
            raise InvalidInputError("bearer_token is required when auth_type is bearer")

    conn = McpConnection(
        name=body.name.strip(),
        endpoint_url=url,
        transport=body.transport,
        auth_type=body.auth_type,
        status="unknown",
    )
    if body.auth_type == "bearer" and body.bearer_token:
        conn.set_bearer_token(body.bearer_token)
    await conn.save()
    # Re-load to decrypt consistently
    conn = await McpConnection.get(str(conn.id))
    return _to_connection_response(conn, available_tool_count=0)


async def delete_connection(connection_id: str) -> None:
    try:
        conn = await McpConnection.get(connection_id)
    except Exception as e:
        raise NotFoundError(f"MCP connection not found: {connection_id}") from e
    await conn.delete()


async def update_auth(
    connection_id: str, body: McpConnectionAuthUpdateRequest
) -> McpConnectionResponse:
    try:
        conn = await McpConnection.get(connection_id)
    except Exception as e:
        raise NotFoundError(f"MCP connection not found: {connection_id}") from e

    if body.auth_type == "bearer":
        require_encryption_key()
        if not body.bearer_token:
            raise InvalidInputError("bearer_token is required when auth_type is bearer")
        conn.auth_type = "bearer"
        conn.set_bearer_token(body.bearer_token)
    else:
        conn.auth_type = "none"
        conn.auth_config = None
    await conn.save()
    conn = await McpConnection.get(connection_id)
    return await get_connection(str(conn.id))


async def test_mcp_connection(connection_id: str) -> McpConnectionResponse:
    try:
        conn = await McpConnection.get(connection_id)
    except Exception as e:
        raise NotFoundError(f"MCP connection not found: {connection_id}") from e
    try:
        await test_connection(conn)
    except Exception as e:
        logger.warning("MCP test failed id={}", connection_id)
        # Status already saved; return current state
        return await get_connection(connection_id)
    return await get_connection(connection_id)


async def sync_mcp_connection(connection_id: str) -> McpConnectionResponse:
    try:
        conn = await McpConnection.get(connection_id)
    except Exception as e:
        raise NotFoundError(f"MCP connection not found: {connection_id}") from e
    try:
        await sync_tools(conn)
    except Exception:
        logger.warning("MCP sync failed id={}", connection_id)
    return await get_connection(connection_id)


async def list_connection_tools(connection_id: str) -> List[McpToolResponse]:
    try:
        conn = await McpConnection.get(connection_id)
    except Exception as e:
        raise NotFoundError(f"MCP connection not found: {connection_id}") from e
    tools = await McpTool.get_by_connection(str(conn.id))
    return [_to_tool_response(t, connection_name=conn.name) for t in tools]


async def list_selectable_tools() -> List[McpToolResponse]:
    rows = await McpTool.list_selectable()
    out: List[McpToolResponse] = []
    for row in rows:
        data = public_tool(
            row,
            connection_name=row.get("connection_name"),
        )
        # connection_id may come as connection_id from query
        if not data.get("connection_id") and row.get("connection_id"):
            data["connection_id"] = str(row["connection_id"])
        out.append(McpToolResponse(**data))
    return out


async def list_session_tool_calls(session_id: str) -> List[ChatToolCallResponse]:
    calls = await ChatToolCall.list_for_session(session_id)
    return [
        ChatToolCallResponse(**public_tool_call({
            "id": str(c.id),
            "session_id": c.session_id,
            "message_id": c.message_id,
            "connection_id": c.connection_id,
            "tool_id": c.tool_id,
            "tool_name": c.tool_name,
            "connection_name": c.connection_name,
            "risk_level": c.risk_level,
            "runtime_name": c.runtime_name,
            "arguments": c.arguments,
            "result_text": c.result_text,
            "status": c.status,
            "error": c.error,
            "created": str(c.created) if c.created else None,
            "updated": str(c.updated) if c.updated else None,
        }))
        for c in calls
    ]

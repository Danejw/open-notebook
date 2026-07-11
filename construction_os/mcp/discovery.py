"""MCP tool discovery and catalog synchronization."""

from __future__ import annotations

from typing import Any, Optional

from loguru import logger

from construction_os.domain.mcp import McpConnection, McpTool, utcnow_iso
from construction_os.mcp.client import McpClient
from construction_os.mcp.result_text import bound_error_message
from construction_os.mcp.risk import classify_tool_risk
from construction_os.mcp.transport import McpTransportError


async def test_connection(connection: McpConnection) -> McpConnection:
    """Initialize an MCP session and update connection status fields."""
    client = _client_for(connection)
    try:
        await client.connect()
        connection.status = "connected"
        connection.server_info = client.server_info
        connection.capabilities = client.capabilities
        connection.last_connected_at = utcnow_iso()
        connection.last_error = None
        await connection.save()
        logger.info("MCP connection ok id={}", connection.id)
        return connection
    except Exception as exc:
        connection.status = "error"
        connection.last_error = bound_error_message(str(exc))
        await connection.save()
        logger.warning("MCP connection failed id={}", connection.id)
        raise


async def sync_tools(connection: McpConnection) -> list[McpTool]:
    """
    Discover tools for a connection: upsert by (connection, name),
    mark missing tools unavailable (do not delete).
    """
    client = _client_for(connection)
    try:
        await client.connect()
        remote_tools = await client.list_tools()
        connection.status = "connected"
        connection.server_info = client.server_info
        connection.capabilities = client.capabilities
        connection.last_connected_at = utcnow_iso()
        connection.last_error = None
    except Exception as exc:
        connection.status = "error"
        connection.last_error = bound_error_message(str(exc))
        await connection.save()
        logger.warning("MCP discovery failed id={}", connection.id)
        raise

    now = utcnow_iso()
    seen_names: set[str] = set()
    upserted: list[McpTool] = []

    for desc in remote_tools:
        name = desc.get("name")
        if not name or not isinstance(name, str):
            continue
        seen_names.add(name)
        title = desc.get("title")
        description = desc.get("description")
        input_schema = desc.get("inputSchema") or desc.get("input_schema")
        output_schema = desc.get("outputSchema") or desc.get("output_schema")
        annotations = desc.get("annotations")
        risk = classify_tool_risk(
            name,
            description if isinstance(description, str) else None,
            annotations if isinstance(annotations, dict) else None,
        )

        existing = await McpTool.find_by_connection_and_name(connection.id, name)
        if existing:
            existing.title = title if isinstance(title, str) else existing.title
            existing.description = (
                description if isinstance(description, str) else existing.description
            )
            existing.input_schema = (
                input_schema if isinstance(input_schema, dict) else existing.input_schema
            )
            existing.output_schema = (
                output_schema
                if isinstance(output_schema, dict)
                else existing.output_schema
            )
            existing.annotations = (
                annotations if isinstance(annotations, dict) else existing.annotations
            )
            existing.risk_level = risk
            existing.available = True
            existing.last_discovered_at = now
            await existing.save()
            upserted.append(existing)
        else:
            tool = McpTool(
                connection=connection.id,
                name=name,
                title=title if isinstance(title, str) else None,
                description=description if isinstance(description, str) else None,
                input_schema=input_schema if isinstance(input_schema, dict) else None,
                output_schema=output_schema if isinstance(output_schema, dict) else None,
                annotations=annotations if isinstance(annotations, dict) else None,
                risk_level=risk,
                available=True,
                last_discovered_at=now,
            )
            await tool.save()
            upserted.append(tool)

    existing_all = await McpTool.get_by_connection(connection.id)
    unavailable = 0
    for tool in existing_all:
        if tool.name not in seen_names and tool.available:
            tool.available = False
            await tool.save()
            unavailable += 1

    connection.last_synced_at = now
    await connection.save()
    logger.info(
        "MCP sync id={} discovered={} unavailable={}",
        connection.id,
        len(seen_names),
        unavailable,
    )
    return await McpTool.get_by_connection(connection.id)


def _client_for(connection: McpConnection) -> McpClient:
    return McpClient(
        connection.endpoint_url,
        bearer_token=connection.get_bearer_token(),
    )

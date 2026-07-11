"""MCP Client API routes."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from loguru import logger

from api import mcp_service
from api.mcp_models import (
    ChatToolCallResponse,
    McpConnectionAuthUpdateRequest,
    McpConnectionCreateRequest,
    McpConnectionResponse,
    McpToolResponse,
)
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.domain import mcp as _mcp_domain  # noqa: F401 — register models

router = APIRouter()


@router.get("/mcp/connections", response_model=List[McpConnectionResponse])
async def list_connections():
    try:
        return await mcp_service.list_connections()
    except Exception as e:
        logger.error(f"Error listing MCP connections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mcp/connections", response_model=McpConnectionResponse)
async def create_connection(body: McpConnectionCreateRequest):
    try:
        return await mcp_service.create_connection(body)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating MCP connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mcp/connections/{connection_id}", response_model=McpConnectionResponse)
async def get_connection(connection_id: str):
    try:
        return await mcp_service.get_connection(connection_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mcp/connections/{connection_id}")
async def delete_connection(connection_id: str):
    try:
        await mcp_service.delete_connection(connection_id)
        return {"success": True}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/mcp/connections/{connection_id}/auth",
    response_model=McpConnectionResponse,
)
async def update_auth(connection_id: str, body: McpConnectionAuthUpdateRequest):
    try:
        return await mcp_service.update_auth(connection_id, body)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (InvalidInputError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/mcp/connections/{connection_id}/test",
    response_model=McpConnectionResponse,
)
async def test_connection(connection_id: str):
    try:
        return await mcp_service.test_mcp_connection(connection_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/mcp/connections/{connection_id}/sync",
    response_model=McpConnectionResponse,
)
async def sync_connection(connection_id: str):
    try:
        return await mcp_service.sync_mcp_connection(connection_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/mcp/connections/{connection_id}/tools",
    response_model=List[McpToolResponse],
)
async def list_connection_tools(connection_id: str):
    try:
        return await mcp_service.list_connection_tools(connection_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mcp/tools/selectable", response_model=List[McpToolResponse])
async def list_selectable_tools():
    try:
        return await mcp_service.list_selectable_tools()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/mcp/sessions/{session_id}/tool-calls",
    response_model=List[ChatToolCallResponse],
)
async def list_session_tool_calls(session_id: str):
    try:
        return await mcp_service.list_session_tool_calls(session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

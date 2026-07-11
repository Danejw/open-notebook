"""Pydantic schemas for the MCP Client API."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class McpConnectionCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    endpoint_url: str = Field(..., min_length=1)
    transport: Literal["streamable_http"] = "streamable_http"
    auth_type: Literal["none", "bearer"] = "none"
    bearer_token: Optional[str] = None


class McpConnectionAuthUpdateRequest(BaseModel):
    auth_type: Literal["none", "bearer"] = "bearer"
    bearer_token: Optional[str] = None


class McpConnectionResponse(BaseModel):
    id: str
    name: str
    endpoint_url: str
    transport: str
    auth_type: str
    has_auth_config: bool
    status: str
    server_info: Optional[Dict[str, Any]] = None
    capabilities: Optional[Dict[str, Any]] = None
    last_connected_at: Optional[str] = None
    last_synced_at: Optional[str] = None
    last_error: Optional[str] = None
    available_tool_count: Optional[int] = None
    owner: Optional[str] = None
    created: Optional[str] = None
    updated: Optional[str] = None


class McpToolResponse(BaseModel):
    id: str
    connection_id: Optional[str] = None
    connection_name: Optional[str] = None
    name: str
    title: Optional[str] = None
    description: Optional[str] = None
    input_schema: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    annotations: Optional[Dict[str, Any]] = None
    risk_level: str
    available: bool
    executable: bool = False
    last_discovered_at: Optional[str] = None
    created: Optional[str] = None
    updated: Optional[str] = None


class ChatToolCallResponse(BaseModel):
    id: str
    session_id: str
    message_id: Optional[str] = None
    connection_id: Optional[str] = None
    tool_id: Optional[str] = None
    tool_name: str
    connection_name: Optional[str] = None
    risk_level: Optional[str] = None
    runtime_name: Optional[str] = None
    arguments: Optional[Dict[str, Any]] = None
    result_text: Optional[str] = None
    status: str
    error: Optional[str] = None
    created: Optional[str] = None
    updated: Optional[str] = None

"""Shared runtime context and DTOs for native capability handlers."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class CapabilityRuntimeContext(BaseModel):
    """Trusted server-side context for native tool handlers."""

    project_id: str
    session_id: str
    message_id: Optional[str] = None
    guest_key: Optional[str] = None
    is_guest: bool = False
    allow_project_artifact_save: bool = False
    enable_native_tools: bool = True
    explicit_skill_ids: list[str] = Field(default_factory=list)
    explicit_collection_ids: list[str] = Field(default_factory=list)
    explicit_mcp_tool_ids: list[str] = Field(default_factory=list)
    explicit_html_template_id: Optional[str] = None
    explicit_artifact_template_id: Optional[str] = None
    context_config: Optional[dict[str, Any]] = None
    model_override: Optional[str] = None
    ephemeral_skill_ids: list[str] = Field(default_factory=list)
    ephemeral_collection_ids: list[str] = Field(default_factory=list)


class CatalogFilter(BaseModel):
    """Optional filters for catalog list tools."""

    query: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None
    use_when: Optional[str] = None


class EvidenceItemOut(BaseModel):
    id: str
    title: Optional[str] = None
    type: str
    excerpt: Optional[str] = None
    score: Optional[float] = None
    parent_id: Optional[str] = None
    provenance: Optional[dict[str, Any]] = None


ToolAccess = Literal["read", "write"]
ToolSource = Literal["native", "mcp"]


class NativeToolDefinition(BaseModel):
    """Declarative metadata for a native Construction OS tool."""

    name: str
    description: str
    access: ToolAccess = "read"
    performed_write: bool = False
    input_model: type[BaseModel]
    # handler is registered separately to avoid serialization issues

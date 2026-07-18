"""Pydantic schemas for the Collections API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CollectionItemSchema(BaseModel):
    item_id: str
    type: str = "text"
    title: str
    url: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    authority: Optional[str] = None
    enabled: bool = True
    priority: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    sort_order: int = 0


class CollectionCreateRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    description: str = ""
    version: Optional[str] = "1.0.0"
    tags: List[str] = Field(default_factory=list)
    use_when: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    visibility: str = "instance"
    status: str = "draft"
    selection: Optional[Dict[str, Any]] = None
    manifest_extra: Optional[Dict[str, Any]] = None
    items: List[CollectionItemSchema] = Field(default_factory=list)


class CollectionUpdateRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    tags: Optional[List[str]] = None
    use_when: Optional[List[str]] = None
    owner: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None
    archived: Optional[bool] = None
    selection: Optional[Dict[str, Any]] = None
    manifest_extra: Optional[Dict[str, Any]] = None


class CollectionReplaceItemsRequest(BaseModel):
    items: List[CollectionItemSchema]


class CollectionImportConfirmRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    description: str = ""
    version: Optional[str] = "1.0.0"
    tags: List[str] = Field(default_factory=list)
    use_when: List[str] = Field(default_factory=list)
    visibility: str = "instance"
    status: str = "draft"
    selection: Optional[Dict[str, Any]] = None
    manifest_extra: Optional[Dict[str, Any]] = None
    manifest_raw: str = ""
    items: List[CollectionItemSchema] = Field(default_factory=list)


class CollectionResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    version: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    use_when: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    visibility: str = "instance"
    status: str = "draft"
    archived: bool = False
    selection: Optional[Dict[str, Any]] = None
    manifest_extra: Optional[Dict[str, Any]] = None
    validation_results: Optional[Dict[str, Any]] = None
    item_count: int = 0
    created: Optional[str] = None
    updated: Optional[str] = None


class CollectionDetailResponse(CollectionResponse):
    items: List[CollectionItemSchema] = Field(default_factory=list)


class CollectionImportPreviewResponse(BaseModel):
    root_name: str
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    items: List[CollectionItemSchema] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    source_filename: Optional[str] = None


class ValidationIssueResponse(BaseModel):
    severity: str
    message: str
    path: Optional[str] = None
    fix: Optional[str] = None


class ValidationResponse(BaseModel):
    valid: bool
    issues: List[ValidationIssueResponse]


class CollectionCatalogItem(BaseModel):
    id: str
    name: str
    description: str
    slug: str
    tags: List[str] = Field(default_factory=list)
    status: str
    archived: bool = False
    item_count: int = 0

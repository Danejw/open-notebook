"""Pydantic schemas for the Skills API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SkillFileSchema(BaseModel):
    path: str
    filename: str
    content: str
    encoding: str = "utf-8"
    mime_type: str = "text/plain"
    size_bytes: int = 0
    required: bool = False


class SkillCreateRequest(BaseModel):
    name: str
    description: str = ""
    tags: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    visibility: str = "instance"
    status: str = "draft"
    version: Optional[str] = None
    files: List[SkillFileSchema] = Field(default_factory=list)


class SkillUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    owner: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None
    archived: Optional[bool] = None
    version: Optional[str] = None


class SkillReplaceFilesRequest(BaseModel):
    files: List[SkillFileSchema]


class SkillFileUpsertRequest(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"
    mime_type: Optional[str] = None


class SkillFileMoveRequest(BaseModel):
    from_path: str
    to_path: str


class SkillImportConfirmRequest(BaseModel):
    name: str
    description: str = ""
    tags: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    files: List[SkillFileSchema]


class SkillResponse(BaseModel):
    id: str
    name: str
    description: str
    tags: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    visibility: str = "instance"
    status: str = "draft"
    archived: bool = False
    validation_results: Optional[Dict[str, Any]] = None
    version: Optional[str] = None
    file_count: int = 0
    created: Optional[str] = None
    updated: Optional[str] = None


class SkillDetailResponse(SkillResponse):
    files: List[SkillFileSchema] = Field(default_factory=list)


class SkillImportPreviewResponse(BaseModel):
    root_name: str
    name: Optional[str] = None
    description: Optional[str] = None
    files: List[SkillFileSchema]
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    source_filename: Optional[str] = None


class SkillBulkImportPreviewItem(SkillImportPreviewResponse):
    selected: bool = True


class SkillBulkImportPreviewResponse(BaseModel):
    items: List[SkillBulkImportPreviewItem]
    errors: List[str] = Field(default_factory=list)


class SkillBulkImportConfirmRequest(BaseModel):
    items: List[SkillImportConfirmRequest]


class SkillBulkImportConfirmResponse(BaseModel):
    imported: List[SkillDetailResponse]
    failed: List[str] = Field(default_factory=list)



class ValidationIssueResponse(BaseModel):
    severity: str
    message: str
    path: Optional[str] = None
    fix: Optional[str] = None


class ValidationResponse(BaseModel):
    valid: bool
    issues: List[ValidationIssueResponse]


class SkillCatalogItem(BaseModel):
    id: str
    name: str
    description: str
    tags: List[str] = Field(default_factory=list)
    status: str
    archived: bool = False

"""Pydantic contracts for the Opportunity Hub API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from construction_os.domain.opportunity import (
    FitRecommendation,
    HawaiiIsland,
    OpportunityMonitoringHealth,
    OpportunitySourceStage,
    OpportunitySourceStatus,
    OpportunityStatus,
    ProcurementType,
)


class OpportunityCreate(BaseModel):
    source_key: str
    external_id: str
    fingerprint: Optional[str] = None
    title: str
    agency: str
    solicitation_number: Optional[str] = None
    procurement_type: ProcurementType = "OTHER"
    source_stage: OpportunitySourceStage = "early_research"
    status: OpportunityStatus = "none"
    source_status: OpportunitySourceStatus = "unknown"
    source_status_reason: Optional[str] = None
    island: HawaiiIsland = "Unknown"
    location: str = ""
    scope_summary: str = ""
    description: str = ""
    trades: List[str] = Field(default_factory=list)
    license_requirements: List[str] = Field(default_factory=list)
    published_at: Optional[datetime] = None
    questions_due_at: Optional[datetime] = None
    prebid_at: Optional[datetime] = None
    bid_due_at: Optional[datetime] = None
    source_updated_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    estimated_value_min: Optional[float] = None
    estimated_value_max: Optional[float] = None
    bid_bond_required: Optional[bool] = None
    bid_bond_percent: Optional[float] = None
    prevailing_wage_required: Optional[bool] = None
    mandatory_site_visit: Optional[bool] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_title: Optional[str] = None
    source_url: str
    description_url: Optional[str] = None
    office_address: Optional[str] = None
    documents: List[Dict[str, Any]] = Field(default_factory=list)
    addenda: List[Dict[str, Any]] = Field(default_factory=list)
    fit_score: Optional[int] = None
    fit_reasons: List[str] = Field(default_factory=list)
    risk_flags: List[str] = Field(default_factory=list)
    extraction_confidence: Optional[float] = None
    raw_payload: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("fit_score")
    @classmethod
    def valid_fit_score(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and not 0 <= value <= 100:
            raise ValueError("fit_score must be between 0 and 100")
        return value

    @field_validator("extraction_confidence")
    @classmethod
    def valid_confidence(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not 0 <= value <= 1:
            raise ValueError("extraction_confidence must be between 0 and 1")
        return value


class OpportunityUpdate(BaseModel):
    title: Optional[str] = None
    agency: Optional[str] = None
    solicitation_number: Optional[str] = None
    procurement_type: Optional[ProcurementType] = None
    source_stage: Optional[OpportunitySourceStage] = None
    status: Optional[OpportunityStatus] = None
    source_status: Optional[OpportunitySourceStatus] = None
    source_status_reason: Optional[str] = None
    island: Optional[HawaiiIsland] = None
    location: Optional[str] = None
    scope_summary: Optional[str] = None
    description: Optional[str] = None
    trades: Optional[List[str]] = None
    license_requirements: Optional[List[str]] = None
    published_at: Optional[datetime] = None
    questions_due_at: Optional[datetime] = None
    prebid_at: Optional[datetime] = None
    bid_due_at: Optional[datetime] = None
    source_updated_at: Optional[datetime] = None
    estimated_value_min: Optional[float] = None
    estimated_value_max: Optional[float] = None
    bid_bond_required: Optional[bool] = None
    bid_bond_percent: Optional[float] = None
    prevailing_wage_required: Optional[bool] = None
    mandatory_site_visit: Optional[bool] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_title: Optional[str] = None
    source_url: Optional[str] = None
    description_url: Optional[str] = None
    office_address: Optional[str] = None
    documents: Optional[List[Dict[str, Any]]] = None
    addenda: Optional[List[Dict[str, Any]]] = None
    fit_score: Optional[int] = None
    fit_reasons: Optional[List[str]] = None
    risk_flags: Optional[List[str]] = None
    extraction_confidence: Optional[float] = None
    archived: Optional[bool] = None


class OpportunityResponse(BaseModel):
    id: str
    source_key: str
    external_id: str
    fingerprint: str
    title: str
    agency: str
    solicitation_number: Optional[str]
    procurement_type: ProcurementType
    source_stage: OpportunitySourceStage
    status: OpportunityStatus
    source_status: OpportunitySourceStatus
    source_status_reason: Optional[str]
    island: HawaiiIsland
    location: str
    scope_summary: str
    description: str
    trades: List[str]
    license_requirements: List[str]
    published_at: Optional[datetime]
    questions_due_at: Optional[datetime]
    prebid_at: Optional[datetime]
    bid_due_at: Optional[datetime]
    source_updated_at: Optional[datetime]
    last_seen_at: Optional[datetime]
    estimated_value_min: Optional[float]
    estimated_value_max: Optional[float]
    bid_bond_required: Optional[bool]
    bid_bond_percent: Optional[float]
    prevailing_wage_required: Optional[bool]
    mandatory_site_visit: Optional[bool]
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    contact_title: Optional[str] = None
    source_url: str
    description_url: Optional[str] = None
    office_address: Optional[str] = None
    documents: List[Dict[str, Any]]
    addenda: List[Dict[str, Any]]
    fit_score: Optional[int]
    fit_reasons: List[str]
    risk_flags: List[str]
    fit_recommendation: FitRecommendation
    fit_breakdown: Dict[str, Dict[str, Any]]
    addendum_impact: Dict[str, Any]
    score_version: str
    score_updated_at: Optional[datetime]
    extraction_confidence: Optional[float]
    monitoring_enabled: bool
    monitoring_health: OpportunityMonitoringHealth
    monitoring_last_checked_at: Optional[datetime]
    monitoring_last_success_at: Optional[datetime]
    monitoring_last_changed_at: Optional[datetime]
    monitoring_next_check_at: Optional[datetime]
    monitoring_last_error: Optional[str]
    monitoring_consecutive_failures: int
    monitoring_lease_until: Optional[datetime]
    monitoring_snapshot_hash: Optional[str]
    monitoring_unread_changes: int
    project_id: Optional[str]
    archived: bool
    created: Optional[datetime]
    updated: Optional[datetime]


class OpportunityListResponse(BaseModel):
    items: List[OpportunityResponse]
    total: int
    offset: int
    limit: int


class OpportunityStatusRequest(BaseModel):
    status: OpportunityStatus


class OpportunityImportRequest(BaseModel):
    items: List[OpportunityCreate] = Field(..., min_length=1, max_length=500)


class OpportunityImportResponse(BaseModel):
    created: int
    updated: int
    failed: int
    errors: List[Dict[str, str]]
    opportunity_ids: List[str]


class PursueOpportunityResponse(BaseModel):
    opportunity: OpportunityResponse
    project_id: str
    project_name: str
    project_created: bool


class OpportunityDashboardResponse(BaseModel):
    total: int
    new: int
    watching: int
    pursuing: int
    submitted: int
    high_fit: int
    due_soon: int
    overdue: int
    pipeline_value_min: float
    pipeline_value_max: float
    by_status: Dict[str, int]
    by_source_stage: Dict[str, int] = Field(default_factory=dict)


class OpportunitySourceResponse(BaseModel):
    id: str
    key: str
    name: str
    category: str
    coverage: str
    portal_url: str
    access_method: Literal[
        "public_page",
        "public_api",
        "authenticated_portal",
        "email_notification",
        "manual_import",
    ]
    check_frequency: Literal["daily", "weekly", "manual"]
    enabled: bool
    description: str
    registration_notes: str
    last_synced_at: Optional[datetime]
    last_sync_status: Optional[Literal["success", "partial", "failed"]]
    last_error: Optional[str]
    sync_collection_id: Optional[str] = None


class SamSyncCollectionUpdate(BaseModel):
    """Persist the preferred collection for SAM.gov Opportunity Hub sync."""

    collection_id: Optional[str] = None


class SamOpportunityUrlImportRequest(BaseModel):
    """Paste a SAM.gov opportunity URL to import one notice into the hub."""

    url: str = Field(..., min_length=1)


class SamOpportunityUrlImportResponse(BaseModel):
    opportunity: OpportunityResponse
    created: bool
    updated: bool


class OpportunityNaicsCollectionItemResponse(BaseModel):
    code: str
    title: str
    description: str = ""
    priority: Optional[int] = None
    item_id: str


class OpportunityNaicsCollectionResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    codes: List[str]
    items: List[OpportunityNaicsCollectionItemResponse]
    is_default: bool = False


class OpportunityScoringProfileUpdate(BaseModel):
    """Body for persisting the company fit scoring profile."""

    name: str = "Default Hawaii contractor"
    licenses: List[str] = Field(default_factory=list)
    preferred_trades: List[str] = Field(default_factory=list)
    supported_islands: List[str] = Field(
        default_factory=lambda: [
            "Oahu",
            "Hawaii",
            "Maui",
            "Kauai",
            "Molokai",
            "Lanai",
            "Statewide",
        ]
    )
    min_project_value: float = 0
    max_project_value: Optional[float] = None
    minimum_bid_days: int = 14
    max_bond_percent: float = 10
    preferred_keywords: List[str] = Field(default_factory=list)
    excluded_keywords: List[str] = Field(default_factory=list)


class OpportunityScoringProfileResponse(BaseModel):
    name: str
    licenses: List[str]
    preferred_trades: List[str]
    supported_islands: List[str]
    min_project_value: float
    max_project_value: Optional[float]
    minimum_bid_days: int
    max_bond_percent: float
    preferred_keywords: List[str]
    excluded_keywords: List[str]
    profile_ready: bool
    score_version: str
    source: Literal["database", "env", "default"]
    weights: Dict[str, int]
    rescored: Optional[int] = None
    failed: Optional[int] = None
    errors: Optional[List[Dict[str, str]]] = None

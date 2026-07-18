"""Normalized procurement opportunities and source registry models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar, Dict, List, Literal, Optional

from pydantic import Field, field_validator

from construction_os.domain.base import ObjectModel
from construction_os.exceptions import InvalidInputError

OpportunityStatus = Literal[
    "new",
    "reviewing",
    "watching",
    "pursuing",
    "submitted",
    "won",
    "lost",
    "no_bid",
    "ignored",
]

ProcurementType = Literal[
    "IFB",
    "RFP",
    "RFQ",
    "RFI",
    "ITB",
    "NOI",
    "OTHER",
]

HawaiiIsland = Literal[
    "Oahu",
    "Hawaii",
    "Maui",
    "Kauai",
    "Molokai",
    "Lanai",
    "Statewide",
    "Pacific",
    "Unknown",
]

FitRecommendation = Literal["pursue", "review", "no_bid"]


class OpportunitySource(ObjectModel):
    """A procurement portal or intake channel that produces opportunities."""

    table_name: ClassVar[str] = "opportunity_source"

    key: str
    name: str
    category: str = "official"
    coverage: str = "Statewide"
    portal_url: str
    access_method: Literal[
        "public_page",
        "public_api",
        "authenticated_portal",
        "email_notification",
        "manual_import",
    ] = "public_page"
    check_frequency: Literal["daily", "weekly", "manual"] = "daily"
    enabled: bool = True
    description: str = ""
    registration_notes: str = ""
    last_synced_at: Optional[datetime] = None
    last_sync_status: Optional[Literal["success", "partial", "failed"]] = None
    last_error: Optional[str] = None
    settings: Dict[str, Any] = Field(default_factory=dict)

    nullable_fields: ClassVar[set[str]] = {
        "last_synced_at",
        "last_sync_status",
        "last_error",
    }

    @field_validator("key", "name", "portal_url")
    @classmethod
    def required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise InvalidInputError("Opportunity source fields cannot be empty")
        return value


class Opportunity(ObjectModel):
    """One normalized IFB, RFP, RFQ, or related procurement request."""

    table_name: ClassVar[str] = "opportunity"

    source_key: str
    external_id: str
    fingerprint: str
    title: str
    agency: str
    solicitation_number: Optional[str] = None
    procurement_type: ProcurementType = "OTHER"
    status: OpportunityStatus = "new"

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
    source_url: str
    description_url: Optional[str] = None
    documents: List[Dict[str, Any]] = Field(default_factory=list)
    addenda: List[Dict[str, Any]] = Field(default_factory=list)

    fit_score: Optional[int] = None
    fit_reasons: List[str] = Field(default_factory=list)
    risk_flags: List[str] = Field(default_factory=list)
    fit_recommendation: FitRecommendation = "review"
    fit_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    addendum_impact: Dict[str, Any] = Field(default_factory=dict)
    score_version: str = "opportunity-fit-v1"
    score_updated_at: Optional[datetime] = None
    extraction_confidence: Optional[float] = None

    project_id: Optional[str] = None
    archived: bool = False
    raw_payload: Dict[str, Any] = Field(default_factory=dict)

    nullable_fields: ClassVar[set[str]] = {
        "solicitation_number",
        "published_at",
        "questions_due_at",
        "prebid_at",
        "bid_due_at",
        "source_updated_at",
        "last_seen_at",
        "estimated_value_min",
        "estimated_value_max",
        "bid_bond_required",
        "bid_bond_percent",
        "prevailing_wage_required",
        "mandatory_site_visit",
        "contact_name",
        "contact_email",
        "contact_phone",
        "description_url",
        "fit_score",
        "score_updated_at",
        "extraction_confidence",
        "project_id",
    }

    @field_validator("source_key", "external_id", "fingerprint", "title", "agency", "source_url")
    @classmethod
    def required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise InvalidInputError("Required opportunity fields cannot be empty")
        return value

    @field_validator("fit_score")
    @classmethod
    def valid_fit_score(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and not 0 <= value <= 100:
            raise InvalidInputError("fit_score must be between 0 and 100")
        return value

    @field_validator("extraction_confidence")
    @classmethod
    def valid_confidence(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and not 0 <= value <= 1:
            raise InvalidInputError("extraction_confidence must be between 0 and 1")
        return value

    async def save(self) -> None:
        """Recalculate fit whenever imported metadata or addenda change."""

        from construction_os.services.opportunity_scoring import apply_opportunity_score

        await apply_opportunity_score(self)
        await super().save()

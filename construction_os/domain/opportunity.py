"""Normalized procurement opportunities, monitoring, and source registry models."""

from __future__ import annotations

from datetime import datetime, timezone
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

OpportunitySourceStatus = Literal[
    "active",
    "inactive",
    "archived",
    "cancelled",
    "awarded",
    "unknown",
]

OpportunityMonitoringHealth = Literal[
    "inactive",
    "pending",
    "healthy",
    "delayed",
    "failing",
    "authentication_required",
    "source_unavailable",
]

OpportunityChangeSeverity = Literal["informational", "important", "critical"]
OpportunityRefreshTrigger = Literal["initial", "scheduled", "manual"]

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
    source_status: OpportunitySourceStatus = "unknown"
    source_status_reason: Optional[str] = None

    island: HawaiiIsland = "Unknown"
    location: str = ""
    scope_summary: str = ""
    description: str = ""
    trades: List[str] = Field(default_factory=list)
    license_requirements: List[str] = Field(default_factory=list)

    naics_code: Optional[str] = None
    matched_naics_codes: List[str] = Field(default_factory=list)
    matched_collection_ids: List[str] = Field(default_factory=list)
    discovery_matches: List[Dict[str, Any]] = Field(default_factory=list)

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

    monitoring_enabled: bool = False
    monitoring_health: OpportunityMonitoringHealth = "inactive"
    monitoring_last_checked_at: Optional[datetime] = None
    monitoring_last_success_at: Optional[datetime] = None
    monitoring_last_changed_at: Optional[datetime] = None
    monitoring_next_check_at: Optional[datetime] = None
    monitoring_last_error: Optional[str] = None
    monitoring_consecutive_failures: int = 0
    monitoring_lease_until: Optional[datetime] = None
    monitoring_snapshot_hash: Optional[str] = None
    monitoring_unread_changes: int = 0

    project_id: Optional[str] = None
    archived: bool = False
    raw_payload: Dict[str, Any] = Field(default_factory=dict)

    nullable_fields: ClassVar[set[str]] = {
        "solicitation_number",
        "source_status_reason",
        "naics_code",
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
        "fit_score",
        "score_updated_at",
        "extraction_confidence",
        "monitoring_last_checked_at",
        "monitoring_last_success_at",
        "monitoring_last_changed_at",
        "monitoring_next_check_at",
        "monitoring_last_error",
        "monitoring_lease_until",
        "monitoring_snapshot_hash",
        "project_id",
    }

    @field_validator(
        "source_key", "external_id", "fingerprint", "title", "agency", "source_url"
    )
    @classmethod
    def required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise InvalidInputError("Required opportunity fields cannot be empty")
        return value

    @field_validator("naics_code")
    @classmethod
    def valid_naics_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = "".join(character for character in str(value) if character.isdigit())
        if not 2 <= len(normalized) <= 6:
            raise InvalidInputError("naics_code must contain between 2 and 6 digits")
        return normalized

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

    @field_validator("monitoring_consecutive_failures", "monitoring_unread_changes")
    @classmethod
    def non_negative_monitoring_count(cls, value: int) -> int:
        if value < 0:
            raise InvalidInputError("Monitoring counters cannot be negative")
        return value

    async def save(self) -> None:
        """Keep monitoring lifecycle aligned with the internal bid workflow."""

        monitored_statuses = {"watching", "pursuing", "submitted"}
        terminal_statuses = {"won", "lost", "no_bid", "ignored"}
        if self.source_key == "sam_gov_hawaii" and self.status in monitored_statuses:
            if not self.monitoring_enabled:
                self.monitoring_enabled = True
                self.monitoring_health = "pending"
                self.monitoring_last_error = None
                self.monitoring_next_check_at = datetime.now(timezone.utc)
        elif self.status in terminal_statuses or self.archived:
            self.monitoring_enabled = False
            self.monitoring_health = "inactive"
            self.monitoring_next_check_at = None
            self.monitoring_lease_until = None

        from construction_os.services.opportunity_scoring import apply_opportunity_score

        apply_opportunity_score(self)
        await super().save()


class OpportunityChange(ObjectModel):
    """Immutable record describing meaningful changes detected during one refresh."""

    table_name: ClassVar[str] = "opportunity_change"

    opportunity_id: str
    detected_at: datetime
    trigger: OpportunityRefreshTrigger
    severity: OpportunityChangeSeverity
    summary: str
    source_updated_at: Optional[datetime] = None
    changed_fields: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    new_documents: List[Dict[str, Any]] = Field(default_factory=list)
    removed_documents: List[Dict[str, Any]] = Field(default_factory=list)
    snapshot_hash: str
    acknowledged: bool = False

    nullable_fields: ClassVar[set[str]] = {"source_updated_at"}

    @field_validator("opportunity_id", "summary", "snapshot_hash")
    @classmethod
    def required_change_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise InvalidInputError("Opportunity change fields cannot be empty")
        return value

"""Persisted company-fit profile for Opportunity Hub scoring."""

from __future__ import annotations

from typing import ClassVar, List, Optional

from pydantic import Field

from construction_os.domain.base import RecordModel


class OpportunityScoringSettings(RecordModel):
    """Singleton company constraints used by the deterministic fit rubric.

    Set ``configured=True`` when the profile is saved via the API/UI so the
    scorer prefers the database over ``OPPORTUNITY_SCORING_PROFILE_JSON``.
    """

    record_id: ClassVar[str] = "construction_os:opportunity_scoring_profile"

    configured: bool = False
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
    preferred_keywords: List[str] = Field(
        default_factory=lambda: [
            "construction",
            "renovation",
            "repair",
            "improvement",
            "public works",
            "tenant improvement",
            "building",
        ]
    )
    excluded_keywords: List[str] = Field(
        default_factory=lambda: [
            "office supplies",
            "software subscription",
            "medical services",
            "food service",
        ]
    )

    def to_scoring_profile(self):
        """Map this singleton to the service-layer scoring DTO."""

        from construction_os.services.opportunity_scoring import OpportunityScoringProfile

        return OpportunityScoringProfile(
            name=self.name,
            licenses=list(self.licenses or []),
            preferred_trades=list(self.preferred_trades or []),
            supported_islands=list(self.supported_islands or []),
            min_project_value=self.min_project_value,
            max_project_value=self.max_project_value,
            minimum_bid_days=self.minimum_bid_days,
            max_bond_percent=self.max_bond_percent,
            preferred_keywords=list(self.preferred_keywords or []),
            excluded_keywords=list(self.excluded_keywords or []),
        )

    def apply_scoring_profile(self, profile) -> None:
        """Copy scoring DTO fields onto this singleton and mark configured."""

        self.name = profile.name
        self.licenses = list(profile.licenses or [])
        self.preferred_trades = list(profile.preferred_trades or [])
        self.supported_islands = list(profile.supported_islands or [])
        self.min_project_value = profile.min_project_value
        self.max_project_value = profile.max_project_value
        self.minimum_bid_days = profile.minimum_bid_days
        self.max_bond_percent = profile.max_bond_percent
        self.preferred_keywords = list(profile.preferred_keywords or [])
        self.excluded_keywords = list(profile.excluded_keywords or [])
        self.configured = True

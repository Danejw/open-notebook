"""Deterministic company-fit scoring for procurement opportunities.

The scorer is intentionally explainable. Each opportunity receives points across
six fixed categories that total 100. The active company profile can be supplied
through ``OPPORTUNITY_SCORING_PROFILE_JSON`` without changing application code.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Mapping, Optional, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError

if TYPE_CHECKING:
    from construction_os.domain.opportunity import Opportunity

SCORE_VERSION = "opportunity-fit-v1"
AUTO_RISK_PREFIX = "[Scoring] "


class OpportunityScoringProfile(BaseModel):
    """Company constraints used by the deterministic fit rubric."""

    model_config = ConfigDict(extra="ignore")

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

    @property
    def is_ready(self) -> bool:
        """A ready profile has enough company-specific data for auto-pursue."""

        return bool(
            self.licenses
            and self.preferred_trades
            and self.supported_islands
            and self.max_project_value is not None
        )


@dataclass(frozen=True)
class ScoreResult:
    score: int
    recommendation: str
    reasons: List[str]
    risk_flags: List[str]
    breakdown: Dict[str, Dict[str, Any]]
    addendum_impact: Dict[str, Any]
    profile_ready: bool
    version: str = SCORE_VERSION


def _normalize(value: Any) -> str:
    text = str(value or "").lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _dedupe(values: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    output: List[str] = []
    for value in values:
        cleaned = value.strip()
        key = cleaned.lower()
        if cleaned and key not in seen:
            seen.add(key)
            output.append(cleaned)
    return output


def _matches(required: str, available: Sequence[str]) -> bool:
    needle = _normalize(required)
    if not needle:
        return False
    for candidate in available:
        normalized = _normalize(candidate)
        if normalized and (normalized in needle or needle in normalized):
            return True
    return False


def _all_text(opportunity: Any) -> str:
    return " ".join(
        _normalize(value)
        for value in (
            getattr(opportunity, "title", ""),
            getattr(opportunity, "scope_summary", ""),
            getattr(opportunity, "description", ""),
            " ".join(getattr(opportunity, "trades", []) or []),
            " ".join(getattr(opportunity, "license_requirements", []) or []),
        )
        if value
    )


def _addendum_text(addenda: Sequence[Mapping[str, Any]]) -> str:
    parts: List[str] = []
    for addendum in addenda:
        if not isinstance(addendum, Mapping):
            continue
        for key in (
            "name",
            "title",
            "description",
            "summary",
            "changes",
            "content",
            "filename",
        ):
            value = addendum.get(key)
            if value:
                parts.append(str(value))
    return _normalize(" ".join(parts))


def analyze_addenda(addenda: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    """Classify visible addendum text as favorable, neutral, or risky.

    Addenda are not automatically good or bad. Only detected changes that affect
    deadline, scope, documents, bonding, site visits, or cancellation change the
    score. Unknown addenda remain neutral and are flagged for review.
    """

    if not addenda:
        return {
            "classification": "none",
            "score_delta": 0,
            "summary": "No addenda detected.",
            "items": [],
        }

    text = _addendum_text(addenda)
    impacts: List[Dict[str, Any]] = []
    delta = 0

    def record(kind: str, points: int, summary: str) -> None:
        nonlocal delta
        impacts.append({"kind": kind, "points": points, "summary": summary})
        delta += points

    deadline_extended = bool(
        re.search(r"(deadline|bid due|response due).{0,45}(extend|extension|later)", text)
        or re.search(r"(extend|extension).{0,45}(deadline|bid due|response due)", text)
    )
    deadline_shortened = bool(
        re.search(r"(deadline|bid due|response due).{0,45}(shorten|earlier|accelerat)", text)
        or re.search(r"(shorten|earlier|accelerat).{0,45}(deadline|bid due|response due)", text)
    )

    if deadline_extended:
        record("favorable", 2, "The response deadline appears to have been extended.")
    if deadline_shortened:
        record("risk", -4, "The response deadline appears to have been shortened.")
    if re.search(r"(additional|added|increase).{0,35}(scope|work|quantity)", text):
        record("risk", -3, "The addendum appears to add scope, work, or quantity.")
    if re.search(r"(remove|delete|reduce).{0,35}(scope|work|quantity)", text):
        record("favorable", 1, "The addendum appears to reduce scope, work, or quantity.")
    if re.search(r"(revised|new|replacement).{0,25}(drawing|plan|specification|sheet)", text):
        record("review", -1, "Drawings or specifications appear to have been revised.")
    if re.search(r"(bond|insurance).{0,35}(increase|higher|additional)", text):
        record("risk", -2, "Bonding or insurance requirements may have increased.")
    if re.search(r"mandatory.{0,25}(site visit|pre bid|prebid)", text):
        record("risk", -2, "A mandatory site visit or pre-bid requirement may have been added.")
    if re.search(r"(cancelled|canceled|solicitation cancellation|notice of cancellation)", text):
        record("critical", -10, "The solicitation appears to have been cancelled.")

    delta = max(-10, min(3, delta))
    if delta > 0:
        classification = "favorable"
    elif delta <= -4:
        classification = "high_risk"
    elif delta < 0:
        classification = "review"
    else:
        classification = "neutral"

    summary = (
        "; ".join(item["summary"] for item in impacts)
        if impacts
        else "Addenda were detected, but their effect could not be determined from available metadata."
    )
    return {
        "classification": classification,
        "score_delta": delta,
        "summary": summary,
        "items": impacts,
    }


def load_opportunity_scoring_profile() -> OpportunityScoringProfile:
    """Load the company profile from one optional JSON environment variable."""

    raw = os.getenv("OPPORTUNITY_SCORING_PROFILE_JSON", "").strip()
    if not raw:
        return OpportunityScoringProfile()
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("profile JSON must be an object")
        return OpportunityScoringProfile.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, ValueError):
        # A malformed profile should never stop opportunity ingestion.
        return OpportunityScoringProfile()


def score_opportunity(
    opportunity: Any,
    profile: Optional[OpportunityScoringProfile] = None,
    *,
    now: Optional[datetime] = None,
) -> ScoreResult:
    """Calculate an explainable fit score out of 100."""

    profile = profile or load_opportunity_scoring_profile()
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    breakdown: Dict[str, Dict[str, Any]] = {}
    reasons: List[str] = []
    risks: List[str] = []

    def add_category(key: str, label: str, points: float, maximum: int, detail: str) -> None:
        awarded = max(0, min(maximum, int(round(points))))
        breakdown[key] = {
            "label": label,
            "score": awarded,
            "max_score": maximum,
            "detail": detail,
        }
        reasons.append(f"{label}: {awarded}/{maximum}. {detail}")

    opportunity_trades = list(getattr(opportunity, "trades", []) or [])
    required_licenses = list(getattr(opportunity, "license_requirements", []) or [])

    if profile.preferred_trades and opportunity_trades:
        matched_trades = [
            trade for trade in opportunity_trades if _matches(trade, profile.preferred_trades)
        ]
        trade_points = 12 * (len(matched_trades) / max(1, len(opportunity_trades)))
        trade_detail = f"{len(matched_trades)} of {len(opportunity_trades)} identified trades match the company profile."
        if not matched_trades:
            risks.append("No identified trade matches the company profile.")
    elif opportunity_trades:
        trade_points = 6
        trade_detail = "Trades were identified, but preferred company trades are not configured."
    else:
        trade_points = 6
        trade_detail = "The solicitation has not identified its trades yet."
        risks.append("Trade requirements are incomplete or unavailable.")

    if required_licenses and profile.licenses:
        matched_licenses = [
            license_name
            for license_name in required_licenses
            if _matches(license_name, profile.licenses)
        ]
        license_points = 13 * (len(matched_licenses) / max(1, len(required_licenses)))
        license_detail = f"{len(matched_licenses)} of {len(required_licenses)} stated license requirements are covered."
        missing = [item for item in required_licenses if item not in matched_licenses]
        if missing:
            risks.append(f"Required licenses may be missing: {', '.join(missing)}.")
    elif required_licenses:
        license_points = 4
        license_detail = "License requirements exist, but company licenses are not configured."
        risks.append("Company license data is required to verify eligibility.")
    else:
        license_points = 7
        license_detail = "No explicit license requirement was found; eligibility still needs verification."

    add_category(
        "trade_license",
        "Trade and license match",
        trade_points + license_points,
        25,
        f"{trade_detail} {license_detail}",
    )

    value = getattr(opportunity, "estimated_value_max", None)
    if value is None:
        value = getattr(opportunity, "estimated_value_min", None)

    if value is None:
        value_points = 10
        value_detail = "The project value is unknown, so capacity fit is provisional."
        risks.append("Estimated project value is unavailable.")
    elif profile.max_project_value is None:
        value_points = 10
        value_detail = "A project value is available, but company maximum capacity is not configured."
    elif value < profile.min_project_value:
        value_points = 12
        value_detail = "The project is below the preferred minimum size."
    elif value <= profile.max_project_value:
        value_points = 20
        value_detail = "The project value falls within the configured company range."
    elif value <= profile.max_project_value * 1.25:
        value_points = 9
        value_detail = "The project is slightly above the configured company capacity."
        risks.append("Project value may exceed preferred capacity and requires management review.")
    else:
        value_points = 0
        value_detail = "The project materially exceeds the configured company capacity."
        risks.append("Project value exceeds configured company capacity.")

    add_category("project_capacity", "Project size and capacity", value_points, 20, value_detail)

    island = str(getattr(opportunity, "island", "Unknown") or "Unknown")
    supported = {_normalize(item) for item in profile.supported_islands}
    if island in {"Unknown", "Pacific"}:
        location_points = 8
        location_detail = "The exact Hawaii island or travel requirement is not confirmed."
        risks.append("Project location or travel burden needs verification.")
    elif _normalize(island) in supported or "statewide" in supported:
        location_points = 15
        location_detail = f"{island} is within the configured service area."
    else:
        location_points = 2
        location_detail = f"{island} is outside the configured service area."
        risks.append(f"The company profile does not currently support work on {island}.")

    add_category("location", "Location and travel fit", location_points, 15, location_detail)

    due = getattr(opportunity, "bid_due_at", None)
    deadline_passed = False
    if due is None:
        schedule_points = 7
        schedule_detail = "No bid deadline was provided."
        risks.append("Bid deadline is unknown.")
    else:
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        days_remaining = (due - now).total_seconds() / 86_400
        if days_remaining < 0:
            deadline_passed = True
            schedule_points = 0
            schedule_detail = "The bid deadline has passed."
            risks.append("The opportunity is already overdue.")
        elif days_remaining < 3:
            schedule_points = 1
            schedule_detail = "Fewer than three days remain to prepare the bid."
            risks.append("The remaining bid window is critically short.")
        elif days_remaining < 7:
            schedule_points = 5
            schedule_detail = "Less than one week remains to prepare the bid."
            risks.append("The remaining bid window is short.")
        elif days_remaining < profile.minimum_bid_days:
            schedule_points = 10
            schedule_detail = "The bid window is workable but below the preferred runway."
        else:
            schedule_points = 15
            schedule_detail = "The remaining bid window meets the configured minimum runway."

    add_category("schedule", "Schedule and bid runway", schedule_points, 15, schedule_detail)

    text = _all_text(opportunity)
    excluded_matches = [keyword for keyword in profile.excluded_keywords if _normalize(keyword) in text]
    preferred_matches = [keyword for keyword in profile.preferred_keywords if _normalize(keyword) in text]

    if excluded_matches:
        experience_points = 0
        experience_detail = f"The scope matches excluded work: {', '.join(excluded_matches)}."
        risks.append(experience_detail)
    elif profile.preferred_keywords and preferred_matches:
        experience_points = min(15, 6 + (3 * len(preferred_matches)))
        experience_detail = f"The scope matches preferred experience areas: {', '.join(preferred_matches)}."
    elif profile.preferred_keywords:
        experience_points = 5
        experience_detail = "No strong preferred-scope match was found in the available notice text."
    else:
        experience_points = 8
        experience_detail = "Preferred experience keywords are not configured."

    add_category("experience", "Relevant scope and experience", experience_points, 15, experience_detail)

    risk_points = 10.0
    if getattr(opportunity, "mandatory_site_visit", None) is True:
        risk_points -= 1
        risks.append("A mandatory site visit or pre-bid meeting is required.")
    if getattr(opportunity, "prevailing_wage_required", None) is True:
        risks.append("Prevailing wage and certified payroll requirements apply.")
    if getattr(opportunity, "bid_bond_required", None) is True:
        bond_percent = getattr(opportunity, "bid_bond_percent", None)
        if bond_percent is not None and bond_percent > profile.max_bond_percent:
            risk_points -= 3
            risks.append(
                f"The {bond_percent:g}% bid bond exceeds the configured {profile.max_bond_percent:g}% preference."
            )
    if not (getattr(opportunity, "documents", None) or []):
        risk_points -= 1
        risks.append("No solicitation documents have been discovered yet.")
    confidence = getattr(opportunity, "extraction_confidence", None)
    if confidence is not None and confidence < 0.6:
        risk_points -= 1
        risks.append("The extracted opportunity data has low confidence.")

    addendum_impact = analyze_addenda(getattr(opportunity, "addenda", []) or [])
    risk_points += int(addendum_impact["score_delta"])
    for item in addendum_impact["items"]:
        if item["points"] < 0:
            risks.append(item["summary"])

    add_category(
        "risk_addenda",
        "Risk and addendum impact",
        risk_points,
        10,
        addendum_impact["summary"],
    )

    score = sum(int(item["score"]) for item in breakdown.values())
    if not profile.is_ready:
        score = min(score, 74)
        risks.append(
            "Company scoring profile is incomplete, so the automatic score is capped at 74."
        )

    critical_text = " ".join(risks).lower()
    if score < 50 or deadline_passed or "cancel" in critical_text:
        recommendation = "no_bid"
    elif score >= 75 and profile.is_ready:
        recommendation = "pursue"
    else:
        recommendation = "review"

    reasons.append(
        f"Recommendation: {recommendation.replace('_', ' ')} based on the {SCORE_VERSION} rubric."
    )
    return ScoreResult(
        score=max(0, min(100, score)),
        recommendation=recommendation,
        reasons=reasons,
        risk_flags=_dedupe(risks),
        breakdown=breakdown,
        addendum_impact=addendum_impact,
        profile_ready=profile.is_ready,
    )


def apply_opportunity_score(
    opportunity: "Opportunity",
    profile: Optional[OpportunityScoringProfile] = None,
) -> ScoreResult:
    """Apply the current score while preserving non-scoring risk flags."""

    result = score_opportunity(opportunity, profile=profile)
    existing_risks = [
        risk
        for risk in (getattr(opportunity, "risk_flags", []) or [])
        if not risk.startswith(AUTO_RISK_PREFIX)
    ]
    opportunity.fit_score = result.score
    opportunity.fit_reasons = result.reasons
    opportunity.risk_flags = _dedupe(
        [*existing_risks, *(f"{AUTO_RISK_PREFIX}{risk}" for risk in result.risk_flags)]
    )
    opportunity.fit_recommendation = result.recommendation
    opportunity.fit_breakdown = result.breakdown
    opportunity.addendum_impact = result.addendum_impact
    opportunity.score_version = result.version
    opportunity.score_updated_at = datetime.now(timezone.utc)
    return result

from datetime import datetime, timedelta, timezone

from construction_os.domain.opportunity import Opportunity
from construction_os.services.opportunity_scoring import (
    OpportunityScoringProfile,
    analyze_addenda,
    score_opportunity,
)


def make_opportunity(**overrides):
    data = {
        "source_key": "test",
        "external_id": "TEST-001",
        "fingerprint": "fingerprint",
        "title": "Building renovation and carpentry improvements",
        "agency": "Test Agency",
        "procurement_type": "IFB",
        "island": "Oahu",
        "location": "Honolulu, Hawaii",
        "scope_summary": "Renovate an occupied public building with carpentry work.",
        "trades": ["Carpentry"],
        "license_requirements": ["C-5"],
        "bid_due_at": datetime.now(timezone.utc) + timedelta(days=30),
        "estimated_value_min": 500_000,
        "estimated_value_max": 1_000_000,
        "bid_bond_required": True,
        "bid_bond_percent": 5,
        "source_url": "https://example.gov/opportunity/1",
        "documents": [{"name": "IFB.pdf", "url": "https://example.gov/ifb.pdf"}],
        "addenda": [],
        "extraction_confidence": 0.9,
    }
    data.update(overrides)
    return Opportunity(**data)


def ready_profile(**overrides):
    data = {
        "name": "Test Contractor",
        "licenses": ["C-5", "C-6"],
        "preferred_trades": ["Carpentry", "General Building"],
        "supported_islands": ["Oahu", "Hawaii"],
        "min_project_value": 100_000,
        "max_project_value": 5_000_000,
        "minimum_bid_days": 14,
        "max_bond_percent": 10,
        "preferred_keywords": ["renovation", "carpentry", "building"],
        "excluded_keywords": ["janitorial", "office supplies"],
    }
    data.update(overrides)
    return OpportunityScoringProfile(**data)


def test_strong_company_match_scores_as_pursue():
    result = score_opportunity(make_opportunity(), profile=ready_profile())

    assert result.score >= 80
    assert result.recommendation == "pursue"
    assert result.breakdown["trade_license"]["score"] >= 20
    assert result.breakdown["schedule"]["score"] == 15


def test_mismatched_high_risk_opportunity_scores_no_bid():
    opportunity = make_opportunity(
        title="Janitorial services contract",
        scope_summary="Provide recurring janitorial services.",
        island="Kauai",
        trades=["Janitorial"],
        license_requirements=["C-13"],
        estimated_value_max=20_000_000,
        bid_due_at=datetime.now(timezone.utc) + timedelta(days=1),
        documents=[],
    )

    result = score_opportunity(opportunity, profile=ready_profile())

    assert result.score < 50
    assert result.recommendation == "no_bid"
    assert any("does not currently support work on Kauai" in risk for risk in result.risk_flags)
    assert any("excluded work" in risk for risk in result.risk_flags)


def test_incomplete_profile_caps_score_and_requires_review():
    result = score_opportunity(
        make_opportunity(),
        profile=OpportunityScoringProfile(),
    )

    assert result.score <= 74
    assert result.recommendation == "review"
    assert any("capped at 74" in risk for risk in result.risk_flags)


def test_expired_strong_match_is_never_recommended_to_pursue():
    result = score_opportunity(
        make_opportunity(bid_due_at=datetime.now(timezone.utc) - timedelta(days=1)),
        profile=ready_profile(),
    )

    assert result.recommendation == "no_bid"
    assert any("overdue" in risk.lower() for risk in result.risk_flags)


def test_addendum_impact_distinguishes_favorable_and_risky_changes():
    favorable = analyze_addenda(
        [{"title": "Addendum 1: Bid deadline extended to August 30"}]
    )
    risky = analyze_addenda(
        [
            {
                "title": "Addendum 2",
                "summary": "Adds additional scope, revised drawings, and shortens the bid deadline.",
            }
        ]
    )

    assert favorable["classification"] == "favorable"
    assert favorable["score_delta"] > 0
    assert risky["classification"] in {"review", "high_risk"}
    assert risky["score_delta"] < 0
    assert len(risky["items"]) >= 2

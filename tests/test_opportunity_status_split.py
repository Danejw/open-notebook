"""Tests for opportunity source_stage / workflow status split."""

from __future__ import annotations

from construction_os.domain.opportunity import Opportunity
from construction_os.services.opportunity_collectors import _infer_source_stage


def test_infer_source_stage_presolicitation():
    assert (
        _infer_source_stage("Building renovations", "Presolicitation")
        == "pre_solicitation"
    )


def test_infer_source_stage_solicitation():
    assert (
        _infer_source_stage("Replace roof systems", "Solicitation")
        == "active_solicitation"
    )


def test_infer_source_stage_sources_sought():
    assert (
        _infer_source_stage("Market research for HVAC", "Sources Sought")
        == "early_research"
    )


def test_legacy_status_new_coerces_to_stage_and_none():
    opportunity = Opportunity.model_validate(
        {
            "source_key": "test",
            "external_id": "1",
            "fingerprint": "fp",
            "title": "Test",
            "agency": "Agency",
            "source_url": "https://example.test/1",
            "status": "new",
        }
    )
    assert opportunity.source_stage == "early_research"
    assert opportunity.status == "none"


def test_legacy_status_watching_keeps_workflow_and_sets_stage():
    opportunity = Opportunity.model_validate(
        {
            "source_key": "test",
            "external_id": "2",
            "fingerprint": "fp2",
            "title": "Test",
            "agency": "Agency",
            "source_url": "https://example.test/2",
            "status": "watching",
        }
    )
    assert opportunity.source_stage == "pre_solicitation"
    assert opportunity.status == "watching"

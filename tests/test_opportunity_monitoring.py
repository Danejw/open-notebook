from datetime import date, datetime, timedelta, timezone

import pytest

from construction_os.domain.base import ObjectModel
from construction_os.domain.opportunity import Opportunity
from construction_os.services.opportunity_monitoring import (
    _merge_document_runtime_metadata,
    detect_opportunity_changes,
    infer_sam_source_state,
    monitoring_interval,
    sam_lookup_params,
    should_record_change,
    snapshot_hash,
)


def make_opportunity(**overrides):
    values = {
        "source_key": "sam_gov_hawaii",
        "external_id": "notice-123",
        "fingerprint": "fingerprint",
        "title": "Repair Building 10",
        "agency": "US Navy",
        "source_url": "https://sam.gov/opp/notice-123/view",
        "source_stage": "active_solicitation",
        "status": "watching",
        "source_status": "active",
        "scope_summary": "Repair the roof.",
        "description": "Repair the roof.",
        "documents": [
            {
                "name": "Solicitation.pdf",
                "url": "https://example.test/sol.pdf",
            }
        ],
    }
    values.update(overrides)
    return Opportunity(**values)


def normalized_from(opportunity: Opportunity, **overrides):
    values = {
        field: getattr(opportunity, field)
        for field in (
            "title",
            "agency",
            "solicitation_number",
            "procurement_type",
            "source_stage",
            "source_status",
            "source_status_reason",
            "location",
            "scope_summary",
            "description",
            "questions_due_at",
            "prebid_at",
            "bid_due_at",
            "source_updated_at",
            "estimated_value_min",
            "estimated_value_max",
            "bid_bond_required",
            "bid_bond_percent",
            "prevailing_wage_required",
            "mandatory_site_visit",
            "contact_name",
            "contact_email",
            "contact_phone",
            "contact_title",
            "source_url",
            "documents",
            "addenda",
        )
    }
    values.update(overrides)
    return values


def test_detects_deadline_and_document_changes_as_critical():
    opportunity = make_opportunity(
        bid_due_at=datetime(2026, 7, 25, tzinfo=timezone.utc)
    )
    normalized = normalized_from(
        opportunity,
        bid_due_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        documents=[
            *opportunity.documents,
            {
                "name": "Amendment 0001.pdf",
                "url": "https://example.test/amendment.pdf",
            },
        ],
        addenda=[
            {
                "name": "Amendment 0001.pdf",
                "url": "https://example.test/amendment.pdf",
            }
        ],
    )

    diff = detect_opportunity_changes(opportunity, normalized)

    assert diff["severity"] == "critical"
    assert "bid_due_at" in diff["changed_fields"]
    assert len(diff["new_documents"]) == 1
    assert "bid deadline changed" in diff["summary"]


def test_raw_payload_changes_do_not_create_false_positive():
    opportunity = make_opportunity(raw_payload={"requestId": "old"})
    normalized = normalized_from(opportunity)
    normalized["raw_payload"] = {"requestId": "new"}

    diff = detect_opportunity_changes(opportunity, normalized)

    assert diff["changed_fields"] == {}
    assert diff["new_documents"] == []


def test_local_document_ingest_metadata_does_not_create_source_change():
    opportunity = make_opportunity(
        documents=[
            {
                "name": "Solicitation.pdf",
                "url": "https://example.test/sol.pdf",
                "source_id": "source:abc",
                "ingest_status": "queued",
            }
        ]
    )
    normalized = normalized_from(
        opportunity,
        documents=[
            {
                "name": "Solicitation.pdf",
                "url": "https://example.test/sol.pdf",
            }
        ],
    )

    diff = detect_opportunity_changes(opportunity, normalized)

    assert "documents" not in diff["changed_fields"]
    assert diff["new_documents"] == []


def test_document_runtime_metadata_is_preserved_across_source_refresh():
    merged = _merge_document_runtime_metadata(
        [
            {
                "name": "Solicitation.pdf",
                "url": "https://example.test/sol.pdf",
                "source_id": "source:abc",
                "ingest_status": "queued",
            }
        ],
        [
            {
                "name": "Solicitation package.pdf",
                "url": "https://example.test/sol.pdf",
            }
        ],
    )

    assert merged[0]["name"] == "Solicitation package.pdf"
    assert merged[0]["source_id"] == "source:abc"
    assert merged[0]["ingest_status"] == "queued"


def test_snapshot_hash_is_stable_for_document_key_order():
    first = {
        "title": "A",
        "documents": [{"name": "Spec", "url": "https://example.test/spec"}],
    }
    second = {
        "documents": [{"url": "https://example.test/spec", "name": "Spec"}],
        "title": "A",
    }

    assert snapshot_hash(first) == snapshot_hash(second)


def test_source_status_is_separate_from_internal_workflow_status():
    opportunity = make_opportunity(status="pursuing", source_status="active")
    normalized = normalized_from(
        opportunity,
        source_status="cancelled",
        source_status_reason="SAM.gov identifies the notice as cancelled",
    )

    diff = detect_opportunity_changes(opportunity, normalized)

    assert opportunity.status == "pursuing"
    assert diff["changed_fields"]["source_status"]["current"] == "cancelled"
    assert diff["severity"] == "critical"


def test_legacy_reviewing_status_maps_to_none_and_pre_solicitation():
    opportunity = make_opportunity(status="reviewing", source_stage=None)

    assert opportunity.status == "none"
    assert opportunity.source_stage == "pre_solicitation"


def test_infer_sam_source_state_handles_awards_and_cancellations():
    assert infer_sam_source_state({"active": "Yes"}) == ("active", None)
    assert infer_sam_source_state({"awardNumber": "W912-26-C-001"})[0] == "awarded"
    assert (
        infer_sam_source_state({"description": "This solicitation is cancelled"})[0]
        == "cancelled"
    )


def test_future_archive_date_is_scheduling_metadata_not_current_state():
    now = datetime(2026, 7, 17, tzinfo=timezone.utc)

    assert (
        infer_sam_source_state(
            {
                "active": "Yes",
                "archiveDate": "2026-08-01",
                "archiveType": "auto",
            },
            now=now,
        )[0]
        == "active"
    )


def test_past_archive_date_is_archived_when_not_active():
    now = datetime(2026, 8, 2, tzinfo=timezone.utc)

    assert (
        infer_sam_source_state(
            {
                "active": "No",
                "archiveDate": "2026-08-01",
                "archiveType": "auto",
            },
            now=now,
        )[0]
        == "archived"
    )


def test_monitoring_interval_becomes_urgent_near_deadline(monkeypatch):
    monkeypatch.delenv("OPPORTUNITY_MONITOR_URGENT_MINUTES", raising=False)
    now = datetime(2026, 7, 17, tzinfo=timezone.utc)
    opportunity = make_opportunity(
        status="watching",
        bid_due_at=now + timedelta(hours=48),
    )

    assert monitoring_interval(opportunity, now) == timedelta(hours=2)


def test_pursuing_checks_more_often_than_watching(monkeypatch):
    monkeypatch.delenv("OPPORTUNITY_MONITOR_PURSUING_MINUTES", raising=False)
    monkeypatch.delenv("OPPORTUNITY_MONITOR_WATCHING_MINUTES", raising=False)
    now = datetime(2026, 7, 17, tzinfo=timezone.utc)
    pursuing = make_opportunity(status="pursuing", bid_due_at=None)
    watching = make_opportunity(status="watching", bid_due_at=None)

    assert monitoring_interval(pursuing, now) == timedelta(hours=6)
    assert monitoring_interval(watching, now) == timedelta(hours=24)


def test_sam_lookup_includes_required_posting_window():
    opportunity = make_opportunity(
        published_at=datetime(2026, 7, 10, tzinfo=timezone.utc)
    )

    params = sam_lookup_params(
        opportunity,
        "test-key",
        today=date(2026, 7, 17),
    )

    assert params["noticeid"] == "notice-123"
    assert params["postedFrom"] == "07/09/2026"
    assert params["postedTo"] == "07/17/2026"
    assert params["limit"] == "10"


def test_first_successful_refresh_establishes_baseline_without_alert():
    opportunity = make_opportunity(source_status="unknown")
    diff = detect_opportunity_changes(
        opportunity,
        normalized_from(opportunity, source_status="active"),
    )

    assert should_record_change(opportunity, "initial", diff) is False


def test_refresh_after_baseline_records_meaningful_change():
    opportunity = make_opportunity(
        source_status="active",
        monitoring_snapshot_hash="existing-snapshot",
        monitoring_last_success_at=datetime(2026, 7, 16, tzinfo=timezone.utc),
    )
    diff = detect_opportunity_changes(
        opportunity,
        normalized_from(opportunity, source_status="cancelled"),
    )

    assert should_record_change(opportunity, "scheduled", diff) is True


@pytest.mark.asyncio
async def test_manual_pause_is_not_reenabled_when_pursuing_opportunity_is_saved(
    monkeypatch,
):
    async def no_op_score(_opportunity):
        return None

    async def no_op_base_save(_opportunity):
        return None

    monkeypatch.setattr(
        "construction_os.services.opportunity_scoring.apply_opportunity_score",
        no_op_score,
    )
    monkeypatch.setattr(ObjectModel, "save", no_op_base_save)

    opportunity = make_opportunity(
        status="pursuing",
        monitoring_enabled=False,
        monitoring_health="inactive",
        monitoring_next_check_at=None,
    )

    await opportunity.save()

    assert opportunity.status == "pursuing"
    assert opportunity.monitoring_enabled is False
    assert opportunity.monitoring_health == "inactive"

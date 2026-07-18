import pytest

from construction_os.services.opportunity_collectors import (
    append_sam_api_key,
    html_to_plain_text,
    looks_like_url,
    normalize_sam_opportunity,
    resolve_sam_description_fields,
)
from construction_os.services.opportunities import build_fingerprint


def test_opportunity_fingerprint_is_stable_and_case_insensitive():
    first = build_fingerprint(
        {
            "source_key": "SAM_GOV_HAWAII",
            "external_id": "NOTICE-123",
            "solicitation_number": "W9128A-26-R-0001",
            "agency": "Department of the Army",
            "title": "Repair Building 100",
        }
    )
    second = build_fingerprint(
        {
            "source_key": "sam gov hawaii",
            "external_id": "notice 123",
            "solicitation_number": "w9128a 26 r 0001",
            "agency": "department of the army",
            "title": "repair building 100",
        }
    )

    assert first == second
    assert len(first) == 64


def test_looks_like_url_and_append_api_key():
    assert looks_like_url("https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc")
    assert not looks_like_url("Repair existing electrical distribution equipment.")
    with_key = append_sam_api_key(
        "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc",
        api_key="test-key",
    )
    assert "api_key=test-key" in with_key
    already = append_sam_api_key(
        "https://example.test/file.pdf?api_key=existing",
        api_key="other",
    )
    assert "api_key=existing" in already
    assert "api_key=other" not in already


def test_html_to_plain_text_strips_tags():
    plain = html_to_plain_text("<p>Hello <b>world</b></p><br/>Next line")
    assert "Hello world" in plain
    assert "Next line" in plain
    assert "<" not in plain


@pytest.mark.asyncio
async def test_resolve_sam_description_fields_fetches_noticedesc(monkeypatch):
    async def fake_fetch(url, *, api_key=None, client=None):
        assert "noticedesc" in url
        return "Narrative scope from SAM."

    monkeypatch.setattr(
        "construction_os.services.opportunity_collectors.fetch_sam_description_text",
        fake_fetch,
    )
    text, desc_url = await resolve_sam_description_fields(
        "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc"
    )
    assert text == "Narrative scope from SAM."
    assert desc_url and desc_url.startswith("https://")


@pytest.mark.asyncio
async def test_normalize_sam_opportunity_extracts_hawaii_bid_fields():
    normalized = await normalize_sam_opportunity(
        {
            "noticeId": "abc123",
            "title": "IFB - Repair Electrical Distribution at Pearl Harbor",
            "solicitationNumber": "N62478-26-B-1000",
            "department": "DEPARTMENT OF THE NAVY",
            "subTier": "NAVAL FACILITIES ENGINEERING SYSTEMS COMMAND",
            "postedDate": "2026-07-10",
            "responseDeadLine": "2026-08-01T20:00:00Z",
            "description": "Repair existing electrical distribution equipment.",
            "uiLink": "https://sam.gov/opp/abc123/view",
            "placeOfPerformance": {
                "city": {"name": "Pearl Harbor"},
                "state": {"code": "HI"},
                "country": {"code": "USA"},
            },
            "pointOfContact": [
                {
                    "fullName": "Contract Specialist",
                    "email": "specialist@example.mil",
                    "phone": "808-555-0100",
                }
            ],
            "resourceLinks": ["https://example.test/specifications.pdf"],
        }
    )

    assert normalized["source_key"] == "sam_gov_hawaii"
    assert normalized["external_id"] == "abc123"
    assert normalized["procurement_type"] == "IFB"
    assert normalized["island"] == "Oahu"
    assert normalized["agency"] == "DEPARTMENT OF THE NAVY"
    assert normalized["bid_due_at"].isoformat() == "2026-08-01T20:00:00+00:00"
    assert normalized["contact_email"] == "specialist@example.mil"
    assert normalized["documents"] == [
        {"url": "https://example.test/specifications.pdf"}
    ]
    assert "description_url" not in normalized


@pytest.mark.asyncio
async def test_normalize_sam_opportunity_fetches_description_url(monkeypatch):
    async def fake_resolve(raw, *, api_key=None, client=None):
        return "Fetched scope narrative.", raw

    monkeypatch.setattr(
        "construction_os.services.opportunity_collectors.resolve_sam_description_fields",
        fake_resolve,
    )
    normalized = await normalize_sam_opportunity(
        {
            "noticeId": "notice-url",
            "title": "IFB Roof work",
            "department": "NAVY",
            "description": "https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=x",
            "resourceLinks": ["https://example.test/a.pdf"],
            "links": [{"rel": "self", "href": "https://api.sam.gov/opp/self"}],
        }
    )
    assert normalized["description"] == "Fetched scope narrative."
    assert normalized["scope_summary"] == "Fetched scope narrative."
    assert normalized["description_url"].startswith("https://api.sam.gov")
    assert normalized["documents"] == [{"url": "https://example.test/a.pdf"}]


@pytest.mark.asyncio
async def test_normalize_sam_opportunity_does_not_invent_procurement_type():
    normalized = await normalize_sam_opportunity(
        {
            "noticeId": "notice-2",
            "title": "Roof replacement and repairs",
            "department": "GENERAL SERVICES ADMINISTRATION",
            "type": "Solicitation",
            "placeOfPerformance": {
                "city": {"name": "Hilo"},
                "state": {"code": "HI"},
            },
        }
    )

    assert normalized["procurement_type"] == "OTHER"
    assert normalized["island"] == "Hawaii"

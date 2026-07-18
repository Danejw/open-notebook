import pytest

from construction_os.services.opportunity_collectors import (
    append_sam_api_key,
    html_to_markdown,
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


def test_html_to_markdown_preserves_structure():
    markdown = html_to_markdown(
        "<h2>Scope</h2><p>Repair <b>roof</b> systems.</p>"
        "<ul><li>Phase 1</li><li>Phase 2</li></ul>"
        '<p>See <a href="https://example.test/doc">docs</a>.</p>'
    )
    assert "## Scope" in markdown
    assert "**roof**" in markdown
    assert "- Phase 1" in markdown
    assert "- Phase 2" in markdown
    assert "[docs](https://example.test/doc)" in markdown
    assert "<" not in markdown


def test_html_to_plain_text_strips_tags():
    plain = html_to_plain_text("<p>Hello <b>world</b></p><br/>Next line")
    assert "Hello" in plain
    assert "world" in plain
    assert "<" not in plain


def test_unwrap_sam_description_payload_extracts_json_description():
    from construction_os.services.opportunity_collectors import unwrap_sam_description_payload

    body = (
        '{"description":" SOURCES SOUGHT \\n\\n INTRODUCTION \\n\\n '
        'The 413th Contracting Support Brigade."}'
    )
    narrative = unwrap_sam_description_payload(body)
    assert narrative.startswith("SOURCES SOUGHT")
    assert "INTRODUCTION" in narrative
    assert "413th Contracting" in narrative
    assert '{"description"' not in narrative
    assert "\\n" not in narrative


@pytest.mark.asyncio
async def test_resolve_unwraps_stored_json_envelope_without_fetch():
    body = '{"description":"Repair roof systems.\\n\\nPhase 1 complete."}'
    text, desc_url = await resolve_sam_description_fields(body)
    assert text.startswith("Repair roof")
    assert "Phase 1" in text
    assert desc_url is None


@pytest.mark.asyncio
async def test_resolve_sam_attachment_name_uses_filename_in_url():
    from construction_os.services.opportunity_collectors import resolve_sam_attachment_name

    name = await resolve_sam_attachment_name(
        "https://sam.gov/api/prod/opps/v3/opportunities/resources/files/Specifications.pdf/download",
        index=0,
    )
    assert name == "Specifications.pdf"


@pytest.mark.asyncio
async def test_resolve_sam_attachment_name_skips_generic_download_label(monkeypatch):
    from construction_os.services.opportunity_collectors import resolve_sam_attachment_name

    class FakeResponse:
        status_code = 200
        headers = {
            "content-disposition": 'attachment; filename="Statement_of_Work.pdf"'
        }
        url = "https://sam.gov/api/prod/opps/v3/opportunities/resources/files/abc/download"

    class FakeClient:
        async def head(self, url):
            return FakeResponse()

        async def get(self, url):
            return FakeResponse()

        async def aclose(self):
            return None

    name = await resolve_sam_attachment_name(
        "https://sam.gov/api/prod/opps/v3/opportunities/resources/files/abc/download",
        preferred_name="download",
        client=FakeClient(),  # type: ignore[arg-type]
        index=2,
    )
    assert name == "Statement_of_Work.pdf"

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
                    "title": "Contract Specialist",
                    "type": "primary",
                }
            ],
            "officeAddress": {
                "city": "Pearl Harbor",
                "state": "HI",
                "zipcode": "96860",
                "countryCode": "USA",
            },
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
    assert normalized["contact_title"] == "Contract Specialist"
    assert normalized["office_address"] == "Pearl Harbor, HI 96860, USA"
    assert normalized["documents"] == [
        {"url": "https://example.test/specifications.pdf", "name": "specifications.pdf"}
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
    assert normalized["documents"] == [
        {"url": "https://example.test/a.pdf", "name": "a.pdf"}
    ]


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


@pytest.mark.asyncio
async def test_normalize_sam_opportunity_prefers_primary_contact():
    normalized = await normalize_sam_opportunity(
        {
            "noticeId": "contact-1",
            "title": "IFB Painting",
            "department": "NAVY",
            "pointOfContact": [
                {
                    "type": "secondary",
                    "fullName": "Secondary Person",
                    "email": "secondary@example.mil",
                },
                {
                    "type": "primary",
                    "fullName": "Primary Person",
                    "email": "primary@example.mil",
                    "phone": "808-555-9999",
                    "title": "Contracting Officer",
                },
            ],
            "officeAddress": {
                "streetAddress": "100 Main St",
                "city": "Honolulu",
                "state": "HI",
                "zipcode": "96813",
            },
        }
    )
    assert normalized["contact_name"] == "Primary Person"
    assert normalized["contact_email"] == "primary@example.mil"
    assert normalized["contact_title"] == "Contracting Officer"
    assert normalized["office_address"] == "100 Main St, Honolulu, HI 96813"

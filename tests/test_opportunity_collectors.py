from datetime import datetime, timedelta, timezone

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


def test_filter_strings_from_collection_items_uses_enabled_titles():
    from construction_os.domain.collection import CollectionItem
    from construction_os.services.opportunity_collectors import (
        filter_strings_from_collection_items,
    )

    items = [
        CollectionItem(
            collection="collection:1",
            item_id="a",
            title="236220",
            enabled=True,
        ),
        CollectionItem(
            collection="collection:1",
            item_id="b",
            title="  238210  ",
            enabled=True,
        ),
        CollectionItem(
            collection="collection:1",
            item_id="c",
            title="236220",
            enabled=True,
        ),
        CollectionItem(
            collection="collection:1",
            item_id="d",
            title="999999",
            enabled=False,
        ),
        CollectionItem(
            collection="collection:1",
            item_id="e",
            title="   ",
            enabled=True,
        ),
    ]
    assert filter_strings_from_collection_items(items) == ["236220", "238210"]


@pytest.mark.asyncio
async def test_resolve_collection_filter_strings_missing_collection(monkeypatch):
    from construction_os.exceptions import NotFoundError
    from construction_os.services.opportunity_collectors import (
        resolve_collection_filter_strings,
    )

    async def fake_get(collection_id: str):
        raise NotFoundError(f"collection with id {collection_id} not found")

    monkeypatch.setattr(
        "construction_os.services.opportunity_collectors.Collection.get",
        fake_get,
    )
    with pytest.raises(NotFoundError):
        await resolve_collection_filter_strings("collection:missing")


@pytest.mark.asyncio
async def test_resolve_collection_filter_strings_empty_titles(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from construction_os.domain.collection import CollectionItem
    from construction_os.exceptions import InvalidInputError
    from construction_os.services.opportunity_collectors import (
        resolve_collection_filter_strings,
    )

    collection = MagicMock()
    collection.get_items = AsyncMock(
        return_value=[
            CollectionItem(
                collection="collection:1",
                item_id="x",
                title="",
                enabled=True,
            )
        ]
    )

    monkeypatch.setattr(
        "construction_os.services.opportunity_collectors.Collection.get",
        AsyncMock(return_value=collection),
    )
    with pytest.raises(InvalidInputError, match="no enabled items"):
        await resolve_collection_filter_strings("collection:1")


@pytest.mark.asyncio
async def test_sync_sam_gov_hawaii_without_collection_omits_ncode(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from construction_os.services import opportunity_collectors as collectors

    captured: list[dict] = []

    class FakeResponse:
        status_code = 200
        headers: dict = {}
        url = "https://api.sam.gov/opportunities/v2/search"

        def raise_for_status(self):
            return None

        def json(self):
            return {"opportunitiesData": [], "totalRecords": 0}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None):
            captured.append(dict(params or {}))
            return FakeResponse()

    source = MagicMock()
    source.key = "sam_gov_hawaii"
    source.settings = {}
    source.save = AsyncMock()

    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")
    monkeypatch.setattr(collectors.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(collectors, "_get_source", AsyncMock(return_value=source))
    monkeypatch.setattr(
        collectors,
        "get_pipeline_active_external_ids",
        AsyncMock(return_value=set()),
    )
    monkeypatch.setattr(
        collectors,
        "import_opportunities",
        AsyncMock(return_value={"created": 0, "updated": 0, "failed": 0, "items": []}),
    )

    result = await collectors.sync_sam_gov_hawaii(days_back=7, limit=50)
    assert len(captured) == 1
    assert "ncode" not in captured[0]
    assert captured[0]["state"] == "HI"
    assert "collection_id" not in result
    assert "filter_strings" not in result
    assert result["skipped_overdue"] == 0
    assert result["skipped_missing_deadline"] == 0


@pytest.mark.asyncio
async def test_sync_sam_gov_hawaii_with_collection_filters_naics_locally(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from construction_os.services import opportunity_collectors as collectors

    captured: list[dict] = []

    class FakeResponse:
        def __init__(self, records):
            self._records = records
            self.status_code = 200
            self.headers = {}
            self.url = "https://api.sam.gov/opportunities/v2/search"

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "opportunitiesData": self._records,
                "totalRecords": len(self._records),
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None):
            params = dict(params or {})
            captured.append(params)
            return FakeResponse(
                [
                    {
                        "noticeId": "a",
                        "title": "A",
                        "department": "NAVY",
                        "naicsCode": "236220",
                    },
                    {
                        "noticeId": "b",
                        "title": "B",
                        "department": "ARMY",
                        "naicsCode": "238210",
                    },
                    {
                        "noticeId": "c",
                        "title": "C",
                        "department": "GSA",
                        "naicsCode": "541511",
                    },
                ]
            )

    source = MagicMock()
    source.key = "sam_gov_hawaii"
    source.settings = {}
    source.save = AsyncMock()

    async def fake_normalize(record, *, api_key=None, client=None):
        return {
            "source_key": "sam_gov_hawaii",
            "external_id": record["noticeId"],
            "title": record["title"],
            "agency": record.get("department", ""),
            "bid_due_at": datetime.now(timezone.utc) + timedelta(days=14),
        }

    imported: list = []

    async def fake_import(rows):
        imported.extend(rows)
        return {"created": len(rows), "updated": 0, "failed": 0, "items": []}

    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")
    monkeypatch.setattr(collectors.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(collectors, "_get_source", AsyncMock(return_value=source))
    monkeypatch.setattr(
        collectors,
        "resolve_collection_filter_strings",
        AsyncMock(return_value=["236220", "238210"]),
    )
    monkeypatch.setattr(collectors, "normalize_sam_opportunity", fake_normalize)
    monkeypatch.setattr(
        collectors,
        "get_pipeline_active_external_ids",
        AsyncMock(return_value=set()),
    )
    monkeypatch.setattr(collectors, "import_opportunities", fake_import)

    result = await collectors.sync_sam_gov_hawaii(
        days_back=7,
        limit=50,
        collection_id="collection:naics",
    )
    assert len(captured) == 1
    assert "ncode" not in captured[0]
    assert result["collection_id"] == "collection:naics"
    assert result["filter_strings"] == ["236220", "238210"]
    assert result["fetched"] == 2
    assert {row["external_id"] for row in imported} == {"a", "b"}
    assert source.settings.get("sync_collection_id") == "collection:naics"
    source.save.assert_awaited()


@pytest.mark.asyncio
async def test_sync_sam_gov_hawaii_reuses_persisted_collection(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from construction_os.services import opportunity_collectors as collectors

    source = MagicMock()
    source.key = "sam_gov_hawaii"
    source.settings = {"sync_collection_id": "collection:saved"}
    source.save = AsyncMock()

    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")
    monkeypatch.setattr(collectors, "_get_source", AsyncMock(return_value=source))
    monkeypatch.setattr(
        collectors,
        "resolve_collection_filter_strings",
        AsyncMock(return_value=["236220"]),
    )
    monkeypatch.setattr(
        collectors,
        "_sam_search",
        AsyncMock(return_value={"opportunitiesData": [], "totalRecords": 0}),
    )
    monkeypatch.setattr(
        collectors,
        "get_pipeline_active_external_ids",
        AsyncMock(return_value=set()),
    )
    monkeypatch.setattr(
        collectors,
        "import_opportunities",
        AsyncMock(return_value={"created": 0, "updated": 0, "failed": 0, "items": []}),
    )

    result = await collectors.sync_sam_gov_hawaii(days_back=7, limit=50)
    assert result["collection_id"] == "collection:saved"
    assert result["filter_strings"] == ["236220"]
    collectors.resolve_collection_filter_strings.assert_awaited_with("collection:saved")


def test_record_matches_collection_filters_and_redacts_api_key():
    from construction_os.services.opportunity_collectors import (
        record_matches_collection_filters,
        redact_sam_error_message,
    )

    assert record_matches_collection_filters(
        {"naicsCode": "236220"}, ["236220", "238210"]
    )
    assert not record_matches_collection_filters(
        {"naicsCode": "541511"}, ["236220"]
    )
    redacted = redact_sam_error_message(
        "429 for https://api.sam.gov/x?api_key=SAM-secret-value&state=HI"
    )
    assert "SAM-secret-value" not in redacted
    assert "api_key=***" in redacted


@pytest.mark.asyncio
async def test_sam_search_retries_on_429(monkeypatch):
    import httpx

    from construction_os.services import opportunity_collectors as collectors

    sleeps: list[float] = []

    class FakeResponse:
        def __init__(self, status_code: int, payload=None):
            self.status_code = status_code
            self.headers = {"Retry-After": "1"}
            self.url = "https://api.sam.gov/opportunities/v2/search?api_key=secret"
            self._payload = payload or {}

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError(
                    "error",
                    request=httpx.Request("GET", str(self.url)),
                    response=httpx.Response(self.status_code),
                )

        def json(self):
            return self._payload

    calls = {"n": 0}

    class FakeClient:
        async def get(self, url, params=None):
            calls["n"] += 1
            if calls["n"] < 3:
                return FakeResponse(429)
            return FakeResponse(200, {"opportunitiesData": [], "totalRecords": 0})

    async def fake_sleep(delay: float):
        sleeps.append(delay)

    monkeypatch.setattr(collectors.asyncio, "sleep", fake_sleep)
    payload = await collectors._sam_search(FakeClient(), {"api_key": "secret"})
    assert payload["totalRecords"] == 0
    assert calls["n"] == 3
    assert sleeps == [1.0, 1.0]


def test_parse_sam_opportunity_notice_id_from_public_and_api_urls():
    from construction_os.exceptions import InvalidInputError
    from construction_os.services.opportunity_collectors import parse_sam_opportunity_notice_id

    notice = "5b345bbb7127b91a3ad577b203fc6f68"
    assert (
        parse_sam_opportunity_notice_id(f"https://sam.gov/opp/{notice}/view") == notice
    )
    assert (
        parse_sam_opportunity_notice_id(f"https://www.sam.gov/opp/{notice}/view/")
        == notice
    )
    assert (
        parse_sam_opportunity_notice_id(
            f"https://sam.gov/workspace/contract/opp/{notice}/view"
        )
        == notice
    )
    assert (
        parse_sam_opportunity_notice_id(
            f"https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid={notice}"
        )
        == notice
    )
    assert (
        parse_sam_opportunity_notice_id(
            f"sam.gov/opp/{notice}/view?utm_source=share"
        )
        == notice
    )

    with pytest.raises(InvalidInputError, match="required"):
        parse_sam_opportunity_notice_id("   ")
    with pytest.raises(InvalidInputError, match="sam.gov"):
        parse_sam_opportunity_notice_id("https://example.com/opp/abc/view")
    with pytest.raises(InvalidInputError, match="notice ID"):
        parse_sam_opportunity_notice_id("https://sam.gov/content/opportunities")


def test_sam_notice_lookup_params_includes_posting_window():
    from datetime import date

    from construction_os.services.opportunity_collectors import sam_notice_lookup_params

    params = sam_notice_lookup_params(
        "notice-123",
        "test-key",
        today=date(2026, 7, 20),
    )
    assert params["noticeid"] == "notice-123"
    assert params["api_key"] == "test-key"
    assert params["postedFrom"] == "07/21/2025"
    assert params["postedTo"] == "07/20/2026"
    assert "state" not in params


@pytest.mark.asyncio
async def test_import_sam_opportunity_from_url_upserts_notice(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from construction_os.services import opportunity_collectors as collectors

    captured: list[dict] = []
    notice = "abc123notice"

    class FakeResponse:
        status_code = 200
        headers: dict = {}
        url = "https://api.sam.gov/opportunities/v2/search"

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "opportunitiesData": [
                    {
                        "noticeId": notice,
                        "title": "Repair Building",
                        "department": "Army",
                    }
                ],
                "totalRecords": 1,
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None):
            captured.append(dict(params or {}))
            return FakeResponse()

    opportunity = MagicMock()
    opportunity.id = "opportunity:1"

    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")
    monkeypatch.setattr(collectors.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(
        collectors,
        "normalize_sam_opportunity",
        AsyncMock(
            return_value={
                "source_key": "sam_gov_hawaii",
                "external_id": notice,
                "title": "Repair Building",
            }
        ),
    )
    monkeypatch.setattr(
        collectors,
        "upsert_opportunity",
        AsyncMock(return_value=(opportunity, True)),
    )

    result = await collectors.import_sam_opportunity_from_url(
        f"https://sam.gov/opp/{notice}/view"
    )
    assert result["created"] is True
    assert result["updated"] is False
    assert result["opportunity"].id == "opportunity:1"
    assert len(captured) == 1
    assert captured[0]["noticeid"] == notice
    assert "state" not in captured[0]
    assert "postedFrom" in captured[0]
    assert "postedTo" in captured[0]


@pytest.mark.asyncio
async def test_import_sam_opportunity_from_url_not_found(monkeypatch):
    from unittest.mock import AsyncMock

    from construction_os.exceptions import NotFoundError
    from construction_os.services import opportunity_collectors as collectors

    class FakeResponse:
        status_code = 200
        headers: dict = {}
        url = "https://api.sam.gov/opportunities/v2/search"

        def raise_for_status(self):
            return None

        def json(self):
            return {"opportunitiesData": [], "totalRecords": 0}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None):
            return FakeResponse()

    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")
    monkeypatch.setattr(collectors.httpx, "AsyncClient", FakeClient)

    with pytest.raises(NotFoundError, match="did not return"):
        await collectors.import_sam_opportunity_from_url(
            "https://sam.gov/opp/missing-notice/view"
        )


@pytest.mark.asyncio
async def test_sync_sam_gov_hawaii_skips_overdue_and_missing_deadlines(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from construction_os.services import opportunity_collectors as collectors

    now = datetime.now(timezone.utc)

    class FakeResponse:
        status_code = 200
        headers: dict = {}
        url = "https://api.sam.gov/opportunities/v2/search"

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "opportunitiesData": [
                    {"noticeId": "future", "title": "Future"},
                    {"noticeId": "overdue", "title": "Overdue"},
                    {"noticeId": "missing", "title": "Missing"},
                    {"noticeId": "watched-overdue", "title": "Watched Overdue"},
                ],
                "totalRecords": 4,
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None):
            return FakeResponse()

    async def fake_normalize(record, *, api_key=None, client=None):
        due_by_id = {
            "future": now + timedelta(days=5),
            "overdue": now - timedelta(days=2),
            "missing": None,
            "watched-overdue": now - timedelta(days=1),
        }
        return {
            "source_key": "sam_gov_hawaii",
            "external_id": record["noticeId"],
            "title": record["title"],
            "bid_due_at": due_by_id[record["noticeId"]],
        }

    imported: list = []

    async def fake_import(rows):
        imported.extend(rows)
        return {"created": len(rows), "updated": 0, "failed": 0, "items": []}

    source = MagicMock()
    source.key = "sam_gov_hawaii"
    source.settings = {}
    source.save = AsyncMock()

    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")
    monkeypatch.setattr(collectors.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(collectors, "_get_source", AsyncMock(return_value=source))
    monkeypatch.setattr(collectors, "normalize_sam_opportunity", fake_normalize)
    monkeypatch.setattr(
        collectors,
        "get_pipeline_active_external_ids",
        AsyncMock(return_value={"watched-overdue"}),
    )
    monkeypatch.setattr(collectors, "import_opportunities", fake_import)

    result = await collectors.sync_sam_gov_hawaii(days_back=7, limit=50)

    assert {row["external_id"] for row in imported} == {"future", "watched-overdue"}
    assert result["skipped_overdue"] == 1
    assert result["skipped_missing_deadline"] == 1


@pytest.mark.asyncio
async def test_import_sam_opportunity_from_url_allows_overdue(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from construction_os.services import opportunity_collectors as collectors

    notice = "past-due-notice"
    opportunity = MagicMock()
    opportunity.id = "opportunity:past"

    class FakeResponse:
        status_code = 200
        headers: dict = {}
        url = "https://api.sam.gov/opportunities/v2/search"

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "opportunitiesData": [
                    {"noticeId": notice, "title": "Past Due Repair"}
                ],
                "totalRecords": 1,
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None):
            return FakeResponse()

    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")
    monkeypatch.setattr(collectors.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(
        collectors,
        "normalize_sam_opportunity",
        AsyncMock(
            return_value={
                "source_key": "sam_gov_hawaii",
                "external_id": notice,
                "title": "Past Due Repair",
                "bid_due_at": datetime.now(timezone.utc) - timedelta(days=3),
            }
        ),
    )
    monkeypatch.setattr(
        collectors,
        "upsert_opportunity",
        AsyncMock(return_value=(opportunity, True)),
    )

    result = await collectors.import_sam_opportunity_from_url(
        f"https://sam.gov/opp/{notice}/view"
    )
    assert result["created"] is True
    assert result["opportunity"].id == "opportunity:past"

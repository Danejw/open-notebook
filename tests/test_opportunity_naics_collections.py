from construction_os.domain.collection import CollectionItem
from construction_os.services.opportunity_collectors import normalize_sam_opportunity
from construction_os.services.opportunity_naics_collections import (
    extract_naics_entries,
    normalize_naics_code,
)


def test_normalize_naics_code_accepts_sector_and_industry_codes():
    assert normalize_naics_code("23") == "23"
    assert normalize_naics_code("236220") == "236220"
    assert normalize_naics_code("NAICS 236-220") == "236220"
    assert normalize_naics_code("1") is None
    assert normalize_naics_code("2362201") is None


def test_extract_naics_entries_uses_enabled_naics_items_only():
    items = [
        CollectionItem(
            collection="collection:construction",
            item_id="commercial-building",
            type="naics",
            title="Commercial building construction",
            enabled=True,
            metadata={"naics_code": "236220"},
        ),
        CollectionItem(
            collection="collection:construction",
            item_id="236210",
            type="naics",
            title="Industrial building construction",
            enabled=True,
        ),
        CollectionItem(
            collection="collection:construction",
            item_id="238210",
            type="naics",
            title="Electrical contractors",
            enabled=False,
        ),
        CollectionItem(
            collection="collection:construction",
            item_id="reference",
            type="url",
            title="Reference page",
            url="https://example.test",
            enabled=True,
        ),
    ]

    assert [entry["code"] for entry in extract_naics_entries(items)] == [
        "236220",
        "236210",
    ]


def test_normalize_sam_opportunity_records_collection_match_provenance():
    normalized = normalize_sam_opportunity(
        {
            "noticeId": "notice-236220",
            "title": "Renovate administration building",
            "department": "DEPARTMENT OF THE NAVY",
            "naicsCode": "236220",
            "placeOfPerformance": {
                "city": {"name": "Honolulu"},
                "state": {"code": "HI"},
            },
        },
        collection_profile={
            "id": "collection:construction",
            "name": "Construction Opportunities",
            "slug": "construction-opportunities",
        },
        matched_naics_codes=["236220", "236210"],
    )

    assert normalized["naics_code"] == "236220"
    assert normalized["matched_naics_codes"] == ["236210", "236220"]
    assert normalized["matched_collection_ids"] == ["collection:construction"]
    assert normalized["discovery_matches"] == [
        {
            "collection_id": "collection:construction",
            "collection_name": "Construction Opportunities",
            "collection_slug": "construction-opportunities",
            "naics_codes": ["236210", "236220"],
        }
    ]


def test_collection_validation_rejects_invalid_naics_code():
    from construction_os.collections.validation import validate_item_record

    invalid = CollectionItem(
        collection="collection:construction",
        item_id="bad-code",
        type="naics",
        title="Invalid NAICS",
        enabled=True,
        metadata={"naics_code": "abc"},
    )

    issues = validate_item_record(invalid)
    assert any("2-6 digit" in issue.message for issue in issues)

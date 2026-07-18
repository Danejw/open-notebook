from construction_os.domain.collection import CollectionItem
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


def test_record_matches_collection_filters_by_naics_code():
    from construction_os.services.opportunity_collectors import (
        record_matches_collection_filters,
        record_naics_codes,
    )

    record = {
        "noticeId": "notice-236220",
        "title": "Renovate administration building",
        "naicsCode": "236220",
    }

    assert record_naics_codes(record) == ["236220"]
    assert record_matches_collection_filters(record, ["236220", "236210"])
    assert not record_matches_collection_filters(record, ["238210"])


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

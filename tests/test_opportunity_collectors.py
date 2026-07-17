from construction_os.services.opportunities import build_fingerprint
from construction_os.services.opportunity_collectors import normalize_sam_opportunity


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


def test_normalize_sam_opportunity_extracts_hawaii_bid_fields():
    normalized = normalize_sam_opportunity(
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


def test_normalize_sam_opportunity_does_not_invent_procurement_type():
    normalized = normalize_sam_opportunity(
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

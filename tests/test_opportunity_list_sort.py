"""Tests for Opportunity Hub list sorting."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from construction_os.domain.opportunity import Opportunity
from construction_os.exceptions import InvalidInputError
from construction_os.services import opportunities as opportunities_service


def _make_opportunity(*, title: str, fit_score: int | None) -> Opportunity:
    now = datetime.now(timezone.utc)
    return Opportunity(
        source_key="test",
        external_id=title.lower().replace(" ", "-"),
        fingerprint=f"fingerprint-{title}",
        title=title,
        agency="Test Agency",
        source_url=f"https://example.test/{title}",
        bid_due_at=now + timedelta(days=10),
        fit_score=fit_score,
    )


@pytest.mark.asyncio
async def test_list_opportunities_sorts_by_fit_score_desc(monkeypatch):
    items = [
        _make_opportunity(title="Low", fit_score=40),
        _make_opportunity(title="High", fit_score=90),
        _make_opportunity(title="Unscored", fit_score=None),
        _make_opportunity(title="Mid", fit_score=65),
    ]
    monkeypatch.setattr(
        Opportunity,
        "get_all",
        AsyncMock(return_value=items),
    )

    result, total = await opportunities_service.list_opportunities(sort="fit_score_desc")

    assert total == 4
    assert [item.title for item in result] == ["High", "Mid", "Low", "Unscored"]


@pytest.mark.asyncio
async def test_list_opportunities_sorts_by_fit_score_asc(monkeypatch):
    items = [
        _make_opportunity(title="High", fit_score=90),
        _make_opportunity(title="Low", fit_score=40),
        _make_opportunity(title="Unscored", fit_score=None),
        _make_opportunity(title="Mid", fit_score=65),
    ]
    monkeypatch.setattr(
        Opportunity,
        "get_all",
        AsyncMock(return_value=items),
    )

    result, total = await opportunities_service.list_opportunities(sort="fit_score_asc")

    assert total == 4
    assert [item.title for item in result] == ["Low", "Mid", "High", "Unscored"]


@pytest.mark.asyncio
async def test_list_opportunities_rejects_invalid_sort(monkeypatch):
    monkeypatch.setattr(
        Opportunity,
        "get_all",
        AsyncMock(return_value=[]),
    )

    with pytest.raises(InvalidInputError, match="sort must be one of"):
        await opportunities_service.list_opportunities(sort="invalid_sort")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_list_opportunities_hides_stale_by_default(monkeypatch):
    now = datetime.now(timezone.utc)
    items = [
        Opportunity(
            source_key="test",
            external_id="future",
            fingerprint="fp-future",
            title="Future",
            agency="Test Agency",
            source_url="https://example.test/future",
            bid_due_at=now + timedelta(days=5),
            status="none",
        ),
        Opportunity(
            source_key="test",
            external_id="overdue",
            fingerprint="fp-overdue",
            title="Overdue",
            agency="Test Agency",
            source_url="https://example.test/overdue",
            bid_due_at=now - timedelta(days=2),
            status="none",
        ),
        Opportunity(
            source_key="test",
            external_id="missing",
            fingerprint="fp-missing",
            title="Missing Deadline",
            agency="Test Agency",
            source_url="https://example.test/missing",
            bid_due_at=None,
            status="none",
        ),
        Opportunity(
            source_key="test",
            external_id="watching-overdue",
            fingerprint="fp-watching",
            title="Watching Overdue",
            agency="Test Agency",
            source_url="https://example.test/watching",
            bid_due_at=now - timedelta(days=1),
            status="watching",
        ),
    ]
    monkeypatch.setattr(Opportunity, "get_all", AsyncMock(return_value=items))

    result, total = await opportunities_service.list_opportunities()

    assert total == 2
    assert {item.external_id for item in result} == {"future", "watching-overdue"}


@pytest.mark.asyncio
async def test_list_opportunities_include_stale_returns_all(monkeypatch):
    now = datetime.now(timezone.utc)
    items = [
        Opportunity(
            source_key="test",
            external_id="future",
            fingerprint="fp-future",
            title="Future",
            agency="Test Agency",
            source_url="https://example.test/future",
            bid_due_at=now + timedelta(days=5),
            status="none",
        ),
        Opportunity(
            source_key="test",
            external_id="overdue",
            fingerprint="fp-overdue",
            title="Overdue",
            agency="Test Agency",
            source_url="https://example.test/overdue",
            bid_due_at=now - timedelta(days=2),
            status="none",
        ),
    ]
    monkeypatch.setattr(Opportunity, "get_all", AsyncMock(return_value=items))

    result, total = await opportunities_service.list_opportunities(include_stale=True)

    assert total == 2
    assert {item.external_id for item in result} == {"future", "overdue"}

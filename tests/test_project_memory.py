"""Focused tests for compact project memory behavior."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from construction_os.services.project_memory import (
    ProjectMemoryDecision,
    ProjectMemorySnapshot,
    consolidate_project_memory,
    extract_evidence_ids,
    inject_project_memory,
    project_memory_record_id,
    should_consolidate_chat,
)


def _snapshot() -> ProjectMemorySnapshot:
    return ProjectMemorySnapshot(
        project_id="project:abc",
        content="## Current status\nEstimating is active.",
        evidence_ids=["source:spec1"],
        revision=2,
        updated_at="2026-07-21T10:00:00+00:00",
    )


def test_project_memory_record_id_is_stable_and_project_scoped():
    first = project_memory_record_id("project:abc")
    second = project_memory_record_id("project:abc")
    other = project_memory_record_id("project:def")

    assert first == second
    assert first.startswith("project_memory:")
    assert first != other
    with pytest.raises(ValueError):
        project_memory_record_id("source:abc")


def test_extract_evidence_ids_deduplicates_in_order():
    text = "source:a note:b source:a and source:c"
    assert extract_evidence_ids(text) == ["source:a", "note:b", "source:c"]


def test_trivial_chat_is_not_scheduled():
    assert not should_consolidate_chat("Thanks!", "You are welcome.")
    assert should_consolidate_chat(
        "Move the bid deadline to August 8.",
        "The current bid deadline is now August 8.",
    )


@pytest.mark.asyncio
async def test_inject_project_memory_extends_existing_system_prompt():
    payload = [
        SystemMessage(content="Existing grounded prompt"),
        HumanMessage(content="What is next?"),
    ]
    with patch(
        "construction_os.services.project_memory.get_project_memory",
        new_callable=AsyncMock,
        return_value=_snapshot(),
    ):
        result = await inject_project_memory(payload, project_id="project:abc")

    assert len(result) == 2
    assert "Existing grounded prompt" in result[0].content
    assert "CURRENT PROJECT STATE" in result[0].content
    assert "Estimating is active" in result[0].content
    assert payload[0].content == "Existing grounded prompt"


@pytest.mark.asyncio
async def test_consolidation_updates_one_revision_with_allowed_evidence():
    structured = MagicMock()
    structured.ainvoke = AsyncMock(
        return_value=ProjectMemoryDecision(
            action="update",
            content="## Current status\nBid deadline moved to August 8.",
            evidence_ids=["source:addendum", "source:not-available"],
        )
    )
    model = MagicMock()
    model.with_structured_output.return_value = structured

    saved = ProjectMemorySnapshot(
        project_id="project:abc",
        content="## Current status\nBid deadline moved to August 8.",
        evidence_ids=["source:addendum"],
        revision=1,
    )

    with (
        patch(
            "construction_os.services.project_memory.get_project_memory",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "construction_os.services.project_memory._load_evidence",
            new_callable=AsyncMock,
            return_value="Addendum evidence",
        ),
        patch(
            "construction_os.services.project_memory.provision_langchain_model",
            new_callable=AsyncMock,
            return_value=model,
        ),
        patch(
            "construction_os.services.project_memory.save_project_memory",
            new_callable=AsyncMock,
            return_value=saved,
        ) as save_memory,
    ):
        snapshot, updated = await consolidate_project_memory(
            project_id="project:abc",
            reason="source_updated",
            candidate_text="The deadline moved.",
            evidence_ids=["source:addendum"],
        )

    assert updated is True
    assert snapshot == saved
    save_memory.assert_awaited_once()
    kwargs = save_memory.await_args.kwargs
    assert kwargs["revision"] == 1
    assert kwargs["evidence_ids"] == ["source:addendum"]


@pytest.mark.asyncio
async def test_consolidation_noop_preserves_previous_memory():
    previous = _snapshot()
    structured = MagicMock()
    structured.ainvoke = AsyncMock(
        return_value=ProjectMemoryDecision(action="noop")
    )
    model = MagicMock()
    model.with_structured_output.return_value = structured

    with (
        patch(
            "construction_os.services.project_memory.get_project_memory",
            new_callable=AsyncMock,
            return_value=previous,
        ),
        patch(
            "construction_os.services.project_memory._load_evidence",
            new_callable=AsyncMock,
            return_value="",
        ),
        patch(
            "construction_os.services.project_memory.provision_langchain_model",
            new_callable=AsyncMock,
            return_value=model,
        ),
        patch(
            "construction_os.services.project_memory.save_project_memory",
            new_callable=AsyncMock,
        ) as save_memory,
    ):
        snapshot, updated = await consolidate_project_memory(
            project_id="project:abc",
            reason="project_chat_completed",
            candidate_text="No durable change.",
        )

    assert updated is False
    assert snapshot == previous
    save_memory.assert_not_awaited()

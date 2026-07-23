"""Tests for shared chat session ID and message hydration helpers."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from construction_os.utils.chat_session import (
    hydrate_langgraph_messages,
    normalize_chat_session_id,
    normalize_source_id,
    resolve_session_collection_ids,
    resolve_session_html_template_id,
    resolve_session_skill_ids,
    session_record_fields,
    session_refers_to,
)


def test_normalize_chat_session_id_adds_prefix():
    assert normalize_chat_session_id("abc") == "chat_session:abc"
    assert normalize_chat_session_id("chat_session:abc") == "chat_session:abc"


def test_normalize_source_id_adds_prefix():
    assert normalize_source_id("src1") == "source:src1"
    assert normalize_source_id("source:src1") == "source:src1"


def test_hydrate_langgraph_messages_without_a2ui():
    values = {
        "messages": [
            SimpleNamespace(id="m1", type="human", content="Hi"),
            SimpleNamespace(id="m2", type="ai", content="Hello"),
        ]
    }
    hydrated = hydrate_langgraph_messages(values)
    assert len(hydrated) == 2
    assert hydrated[0]["id"] == "m1"
    assert hydrated[0]["type"] == "human"
    assert hydrated[0]["content"] == "Hi"
    assert "a2ui_payload" not in hydrated[0]


def test_hydrate_langgraph_messages_with_a2ui():
    values = {
        "messages": [SimpleNamespace(id="m1", type="ai", content="Done")],
        "a2ui_by_message_id": {"m1": [{"surfaceId": "s1"}]},
    }
    hydrated = hydrate_langgraph_messages(values, include_a2ui=True)
    assert hydrated[0]["a2ui_payload"] == [{"surfaceId": "s1"}]


def test_hydrate_langgraph_messages_empty_state():
    assert hydrate_langgraph_messages(None) == []
    assert hydrate_langgraph_messages({}) == []


def test_hydrate_langgraph_messages_extracts_list_content():
    values = {
        "messages": [
            SimpleNamespace(
                id="m1",
                type="ai",
                content=[{"type": "text", "text": "Structured reply"}],
            )
        ]
    }
    hydrated = hydrate_langgraph_messages(values)
    assert hydrated[0]["content"] == "Structured reply"


def test_session_record_fields_defaults():
    session = SimpleNamespace(
        id="chat_session:1",
        title=None,
        model_override="gpt-test",
        skill_ids=None,
        collection_ids=["collection:abc"],
        html_template_id="html_template:t1",
        created="2026-01-01",
        updated="2026-01-02",
    )
    fields = session_record_fields(session)
    assert fields["id"] == "chat_session:1"
    assert fields["title"] == "Untitled Session"
    assert fields["skill_ids"] == []
    assert fields["collection_ids"] == ["collection:abc"]
    assert fields["html_template_id"] == "html_template:t1"


def test_resolve_session_skill_ids_from_request():
    session = SimpleNamespace(skill_ids=["old"])
    resolved = resolve_session_skill_ids(session, ["new"])
    assert resolved == ["new"]
    assert session.skill_ids == ["new"]


def test_resolve_session_skill_ids_from_session():
    session = SimpleNamespace(skill_ids=["stored"])
    resolved = resolve_session_skill_ids(session, None)
    assert resolved == ["stored"]


def test_resolve_session_collection_ids_from_request():
    session = SimpleNamespace(collection_ids=["old"])
    resolved = resolve_session_collection_ids(session, ["new"])
    assert resolved == ["new"]
    assert session.collection_ids == ["new"]


def test_resolve_session_collection_ids_from_session():
    session = SimpleNamespace(collection_ids=["stored"])
    resolved = resolve_session_collection_ids(session, None)
    assert resolved == ["stored"]


def test_resolve_session_html_template_id_clears_on_empty_string():
    session = SimpleNamespace(html_template_id="html_template:old")
    resolved = resolve_session_html_template_id(session, "")
    assert resolved is None
    assert session.html_template_id is None


@pytest.mark.asyncio
async def test_session_refers_to_true():
    with patch(
        "construction_os.utils.chat_session.repo_query",
        new=AsyncMock(return_value=[{"in": "chat_session:1"}]),
    ):
        assert await session_refers_to("1", "source:abc") is True


@pytest.mark.asyncio
async def test_session_refers_to_false():
    with patch(
        "construction_os.utils.chat_session.repo_query",
        new=AsyncMock(return_value=[]),
    ):
        assert await session_refers_to("1", "source:abc") is False


@pytest.mark.asyncio
async def test_list_chat_sessions_for_out():
    session = SimpleNamespace(id="chat_session:1")
    with patch(
        "construction_os.utils.chat_session.repo_query",
        new=AsyncMock(return_value=[{"in": "chat_session:1"}]),
    ), patch(
        "construction_os.utils.chat_session.ChatSession.get",
        new=AsyncMock(return_value=session),
    ) as get_mock:
        from construction_os.utils.chat_session import list_chat_sessions_for_out

        sessions = await list_chat_sessions_for_out("source:abc")
        assert sessions == [session]
        get_mock.assert_awaited_once_with("chat_session:1")

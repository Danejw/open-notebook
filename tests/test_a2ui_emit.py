"""Tests for A2UI emit helpers used by project chat."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from construction_os.graphs.a2ui_emit import (
    A2UI_EVENT,
    COS_CATALOG_ID,
    build_ask_user_messages,
    emit_a2ui,
    format_a2ui_agent_catalog,
    is_a2ui_chat_enabled,
    validate_a2ui_messages,
)


def test_format_a2ui_agent_catalog_lists_current_components():
    text = format_a2ui_agent_catalog()
    assert "AskUser" in text
    assert "SourceChipList" not in text
    assert COS_CATALOG_ID in text


def test_is_a2ui_chat_enabled_reads_env(monkeypatch):
    monkeypatch.delenv("A2UI_CHAT_ENABLED", raising=False)
    assert is_a2ui_chat_enabled() is True
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "true")
    assert is_a2ui_chat_enabled() is True
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "0")
    assert is_a2ui_chat_enabled() is False
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "false")
    assert is_a2ui_chat_enabled() is False


def test_build_ask_user_messages_orders_recommended_and_validates():
    messages = build_ask_user_messages(
        question="Which package covers the kitchen hood?",
        options=[
            {"id": "mech", "label": "Mechanical", "recommended": False},
            {"id": "elec", "label": "Electrical", "recommended": True},
        ],
        surface_id="ask-user-test",
    )
    assert messages[0]["createSurface"]["surfaceId"] == "ask-user-test"
    components = messages[1]["updateComponents"]["components"]
    assert components[0]["id"] == "root"
    assert components[1]["component"] == "AskUser"
    options = messages[2]["updateDataModel"]["value"]["options"]
    assert options[0]["id"] == "mech"
    assert options[1]["recommended"] is True
    validate_a2ui_messages(messages)


def test_build_ask_user_messages_unique_surface_ids():
    a = build_ask_user_messages(question="Q?", options=[{"label": "A"}])
    b = build_ask_user_messages(question="Q?", options=[{"label": "A"}])
    assert a[0]["createSurface"]["surfaceId"] != b[0]["createSurface"]["surfaceId"]
    assert a[0]["createSurface"]["surfaceId"].startswith("ask-user-")


def test_emit_a2ui_dispatches_custom_event(monkeypatch):
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "1")
    messages = build_ask_user_messages(
        question="Q?",
        options=[{"id": "a", "label": "A"}],
    )
    config = {"configurable": {"thread_id": "chat_session:test"}}
    with patch(
        "construction_os.graphs.a2ui_emit.dispatch_custom_event"
    ) as dispatch:
        assert emit_a2ui(messages, config, message_id="ai-1") is True
        dispatch.assert_called_once()
        args = dispatch.call_args
        assert args.args[0] == A2UI_EVENT
        assert args.args[1]["messageId"] == "ai-1"
        assert args.args[1]["messages"] == messages


def test_emit_a2ui_skips_when_disabled(monkeypatch):
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "0")
    messages = build_ask_user_messages(
        question="Q?",
        options=[{"id": "a", "label": "A"}],
    )
    with patch(
        "construction_os.graphs.a2ui_emit.dispatch_custom_event"
    ) as dispatch:
        assert emit_a2ui(messages, MagicMock()) is False
        dispatch.assert_not_called()

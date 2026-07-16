"""Tests for A2UI emit helpers used by project chat."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from construction_os.graphs.a2ui_emit import (
    A2UI_EVENT,
    COS_CATALOG_ID,
    build_context_confirm_messages,
    emit_a2ui,
    is_a2ui_chat_enabled,
    validate_a2ui_messages,
)


def test_is_a2ui_chat_enabled_reads_env(monkeypatch):
    monkeypatch.delenv("A2UI_CHAT_ENABLED", raising=False)
    assert is_a2ui_chat_enabled() is False
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "true")
    assert is_a2ui_chat_enabled() is True
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "0")
    assert is_a2ui_chat_enabled() is False


def test_build_context_confirm_messages_stable_component_ids():
    messages = build_context_confirm_messages(
        sources=[{"id": "source:1", "title": "Plan"}],
        notes=[{"id": "note:2", "title": "Memo"}],
        surface_id="context-confirm-test",
    )
    assert messages[0]["createSurface"]["catalogId"] == COS_CATALOG_ID
    assert messages[0]["createSurface"]["surfaceId"] == "context-confirm-test"
    components = messages[1]["updateComponents"]["components"]
    ids = [c["id"] for c in components]
    assert ids == [
        "root",
        "title",
        "source-list",
        "missing-field",
        "confirm-actions",
    ]
    validate_a2ui_messages(messages)


def test_build_context_confirm_messages_unique_surface_ids():
    a = build_context_confirm_messages(sources=[{"id": "source:1", "title": "Plan"}])
    b = build_context_confirm_messages(sources=[{"id": "source:1", "title": "Plan"}])
    assert a[0]["createSurface"]["surfaceId"] != b[0]["createSurface"]["surfaceId"]
    assert a[0]["createSurface"]["surfaceId"].startswith("context-confirm-")


def test_emit_a2ui_dispatches_custom_event(monkeypatch):
    monkeypatch.setenv("A2UI_CHAT_ENABLED", "1")
    messages = build_context_confirm_messages(
        sources=[{"id": "source:1", "title": "Plan"}]
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
    monkeypatch.delenv("A2UI_CHAT_ENABLED", raising=False)
    messages = build_context_confirm_messages(
        sources=[{"id": "source:1", "title": "Plan"}]
    )
    with patch(
        "construction_os.graphs.a2ui_emit.dispatch_custom_event"
    ) as dispatch:
        assert emit_a2ui(messages, MagicMock()) is False
        dispatch.assert_not_called()

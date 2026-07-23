"""Emit AG-UI CUSTOM events carrying A2UI v0.9 message payloads."""

from __future__ import annotations

import os
import uuid
from typing import Any, Dict, List, Optional

from langchain_core.callbacks.manager import dispatch_custom_event
from langchain_core.runnables import RunnableConfig
from loguru import logger

A2UI_EVENT = "a2ui"
A2UI_PROTOCOL_VERSION = "v0.9"
COS_CATALOG_ID = (
    "https://www.construction-os.ai/a2ui/catalogs/cos/v1/catalog.json"
)
ASK_USER_SURFACE_PREFIX = "ask-user"

ALLOWED_COMPONENT_NAMES = frozenset(
    {
        "Row",
        "Column",
        "List",
        "Card",
        "Tabs",
        "Modal",
        "Divider",
        "Text",
        "Image",
        "Icon",
        "Video",
        "AudioPlayer",
        "Button",
        "TextField",
        "CheckBox",
        "ChoicePicker",
        "Slider",
        "DateTimeInput",
        "AskUser",
    }
)


def format_a2ui_agent_catalog() -> str:
    """Catalog text injected into the project-chat system prompt when A2UI is on."""
    return (
        "Protocol: A2UI v0.9. Catalog: Cos "
        f"({COS_CATALOG_ID}).\n"
        "\n"
        "Cos component:\n"
        "- AskUser — clarifying multi-choice + optional free text. "
        "Props: question, options ({id, label, recommended?}), customValue "
        "(start empty), selectedOptionId (start empty), customPlaceholder, "
        "submitLabel. Event: ask_user_answer "
        "(context: question, answer, optionId, optionLabel, customText). "
        "Recommended options render first; tap submits; free-text + Submit "
        "when none fit.\n"
        "\n"
        "Basic components also allowed: Row, Column, List, Card, Tabs, Modal, "
        "Divider, Text, Image, Icon, Video, AudioPlayer, Button, TextField, "
        "CheckBox, ChoicePicker, Slider, DateTimeInput.\n"
        "\n"
        "Rules:\n"
        "- Every surface needs a component with id root (usually Column).\n"
        "- Use only components from this list.\n"
        "- Prefer AskUser over long clarifying prose when the user must choose.\n"
        "- Keep a concise markdown answer/fallback alongside any interactive UI.\n"
        "- Never paste component JSON into the chat text. Interactive UI must use "
        "A2UI v0.9 protocol messages (createSurface / updateComponents / "
        "updateDataModel), not prose JSON. The client recovers inline JSON as a "
        "fallback only.\n"
        "- Never write protocol names or fake calls in the user-visible reply "
        "(no a2ui.createSurface(), createSurface(), updateComponents(), etc.). "
        "User-visible text must be plain language only.\n"
        "- When the user message starts with [A2UI:ask_user_answer], honor their "
        "choice or custom text and continue the task."
    )


def is_a2ui_chat_enabled() -> bool:
    """Backend flag: A2UI on by default. Disable with A2UI_CHAT_ENABLED=0|false|no|off."""
    value = (os.environ.get("A2UI_CHAT_ENABLED") or "").strip().lower()
    if not value:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return True


def validate_a2ui_messages(messages: List[Dict[str, Any]]) -> None:
    """Light allowlist validation before emit."""
    if not messages:
        raise ValueError("A2UI payload must be non-empty")
    for message in messages:
        if message.get("version") != A2UI_PROTOCOL_VERSION:
            raise ValueError("Only A2UI v0.9 messages are supported")
        create = message.get("createSurface")
        if create and create.get("catalogId") != COS_CATALOG_ID:
            raise ValueError(f"Unsupported catalogId: {create.get('catalogId')}")
        update = message.get("updateComponents")
        if update:
            for component in update.get("components") or []:
                name = component.get("component")
                if name not in ALLOWED_COMPONENT_NAMES:
                    raise ValueError(f"Unregistered component: {name}")


def build_ask_user_messages(
    *,
    question: str,
    options: List[Dict[str, Any]],
    surface_id: Optional[str] = None,
    custom_placeholder: str = "Or type your own answer…",
    submit_label: str = "Submit answer",
) -> List[Dict[str, Any]]:
    """
    Build an AskUser clarifying surface.

    Each option is ``{id, label, recommended?}``. Recommended options are
    shown first in the UI.
    """
    surface = surface_id or f"{ASK_USER_SURFACE_PREFIX}-{uuid.uuid4().hex[:12]}"
    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(options):
        option_id = str(item.get("id") or f"option-{index + 1}")
        label = str(item.get("label") or item.get("title") or f"Option {index + 1}")
        normalized.append(
            {
                "id": option_id,
                "label": label,
                "recommended": bool(item.get("recommended")),
            }
        )

    return [
        {
            "version": A2UI_PROTOCOL_VERSION,
            "createSurface": {
                "surfaceId": surface,
                "catalogId": COS_CATALOG_ID,
                "sendDataModel": True,
            },
        },
        {
            "version": A2UI_PROTOCOL_VERSION,
            "updateComponents": {
                "surfaceId": surface,
                "components": [
                    {
                        "id": "root",
                        "component": "Column",
                        "children": ["ask-user"],
                    },
                    {
                        "id": "ask-user",
                        "component": "AskUser",
                        "question": {"path": "/question"},
                        "options": {"path": "/options"},
                        "customValue": {"path": "/customText"},
                        "selectedOptionId": {"path": "/selectedOptionId"},
                        "customPlaceholder": custom_placeholder,
                        "submitLabel": submit_label,
                    },
                ],
            },
        },
        {
            "version": A2UI_PROTOCOL_VERSION,
            "updateDataModel": {
                "surfaceId": surface,
                "path": "/",
                "value": {
                    "question": question,
                    "options": normalized,
                    "customText": "",
                    "selectedOptionId": "",
                },
            },
        },
    ]


def emit_a2ui(
    messages: List[Dict[str, Any]],
    config: Optional[RunnableConfig] = None,
    *,
    message_id: Optional[str] = None,
    surface_id: Optional[str] = None,
) -> bool:
    """
    Emit A2UI messages as an AG-UI CUSTOM event.

    Returns True when emitted, False when skipped (disabled / invalid).
    """
    if not is_a2ui_chat_enabled():
        return False
    if not config:
        return False
    try:
        validate_a2ui_messages(messages)
    except Exception as exc:
        logger.warning("Skipping invalid A2UI payload: {}", exc)
        return False

    resolved_surface = surface_id
    if not resolved_surface:
        for msg in messages:
            create = msg.get("createSurface") if isinstance(msg, dict) else None
            if isinstance(create, dict) and create.get("surfaceId"):
                resolved_surface = str(create["surfaceId"])
                break

    payload: Dict[str, Any] = {
        "messages": messages,
        "surfaceId": resolved_surface or f"{ASK_USER_SURFACE_PREFIX}-unknown",
    }
    if message_id:
        payload["messageId"] = message_id

    dispatch_custom_event(A2UI_EVENT, payload, config=config)
    return True

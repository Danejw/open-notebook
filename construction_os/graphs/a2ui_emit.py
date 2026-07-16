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
CONTEXT_CONFIRM_SURFACE_PREFIX = "context-confirm"

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
        "SourceChipList",
        "MissingFieldForm",
        "ConfirmActions",
    }
)


def is_a2ui_chat_enabled() -> bool:
    """Backend flag: A2UI_CHAT_ENABLED=true|1|yes."""
    value = (os.environ.get("A2UI_CHAT_ENABLED") or "").strip().lower()
    return value in {"1", "true", "yes"}


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


def build_context_confirm_messages(
    *,
    sources: List[Dict[str, str]],
    notes: Optional[List[Dict[str, str]]] = None,
    title: str = "Confirm context for this answer",
    surface_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Build a context-confirm surface with a unique surfaceId per turn."""
    surface = surface_id or f"{CONTEXT_CONFIRM_SURFACE_PREFIX}-{uuid.uuid4().hex[:12]}"
    chips: List[Dict[str, str]] = []
    for item in sources:
        chips.append(
            {
                "id": str(item.get("id") or ""),
                "title": str(item.get("title") or "Source"),
                "kind": "source",
            }
        )
    for item in notes or []:
        chips.append(
            {
                "id": str(item.get("id") or ""),
                "title": str(item.get("title") or "Note"),
                "kind": "note",
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
                        # A2uiSurface always mounts id "root".
                        "id": "root",
                        "component": "Column",
                        "children": [
                            "title",
                            "source-list",
                            "missing-field",
                            "confirm-actions",
                        ],
                    },
                    {
                        "id": "title",
                        "component": "Text",
                        "text": {"path": "/title"},
                        "variant": "h3",
                    },
                    {
                        "id": "source-list",
                        "component": "SourceChipList",
                        "title": "Sources in context",
                        "sources": {"path": "/sources"},
                    },
                    {
                        "id": "missing-field",
                        "component": "MissingFieldForm",
                        "label": "Anything missing?",
                        "hint": "Optional note for the assistant",
                        "value": {"path": "/missingNote"},
                    },
                    {
                        "id": "confirm-actions",
                        "component": "ConfirmActions",
                        "confirmLabel": "Confirm context",
                        "refineLabel": "Refine",
                        "onConfirm": {
                            "event": {
                                "name": "confirm_context",
                                "context": {
                                    "missingNote": {"path": "/missingNote"},
                                    "sourceCount": {"path": "/sourceCount"},
                                },
                            }
                        },
                        "onRefine": {
                            "event": {
                                "name": "refine_context",
                                "context": {
                                    "missingNote": {"path": "/missingNote"},
                                },
                            }
                        },
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
                    "title": title,
                    "sourceCount": len(chips),
                    "missingNote": "",
                    "sources": chips,
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
        "surfaceId": resolved_surface or f"{CONTEXT_CONFIRM_SURFACE_PREFIX}-unknown",
    }
    if message_id:
        payload["messageId"] = message_id

    # #region agent log
    try:
        import json
        import time
        from pathlib import Path

        log_path = Path(__file__).resolve().parents[2] / "debug-eba9bf.log"
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "sessionId": "eba9bf",
                        "hypothesisId": "E",
                        "location": "a2ui_emit.py:emit_a2ui",
                        "message": "emitting a2ui payload",
                        "data": {
                            "surfaceId": payload["surfaceId"],
                            "messageCount": len(messages),
                            "hasMessageId": bool(message_id),
                        },
                        "timestamp": int(time.time() * 1000),
                    }
                )
                + "\n"
            )
    except Exception:
        pass
    # #endregion

    dispatch_custom_event(A2UI_EVENT, payload, config=config)
    return True

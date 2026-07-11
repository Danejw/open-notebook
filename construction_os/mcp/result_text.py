"""Convert MCP tool results into bounded text for the language model."""

from __future__ import annotations

import json
from typing import Any, Optional

from open_notebook.mcp.limits import MAX_RESULT_CHARS


def mcp_result_to_text(
    result: Any,
    *,
    max_chars: int = MAX_RESULT_CHARS,
) -> str:
    """
    Produce bounded text from an MCP tools/call result.

    Preserves textual content, serializes structured content when useful,
    and represents non-text content safely. Truncates with a clear marker.
    """
    if result is None:
        return ""

    parts: list[str] = []

    if isinstance(result, dict):
        if result.get("isError"):
            parts.append("[MCP tool reported an error]")
        content = result.get("content")
        if isinstance(content, list):
            for item in content:
                parts.append(_content_item_to_text(item))
        elif content is not None:
            parts.append(_content_item_to_text(content))

        structured = result.get("structuredContent")
        if structured is not None:
            parts.append(_safe_json(structured))

        # Fallback: whole dict if nothing extracted
        if not parts:
            parts.append(_safe_json(result))
    elif isinstance(result, list):
        for item in result:
            parts.append(_content_item_to_text(item))
    else:
        parts.append(str(result))

    text = "\n".join(p for p in parts if p).strip()
    return _truncate(text, max_chars)


def _content_item_to_text(item: Any) -> str:
    if item is None:
        return ""
    if isinstance(item, str):
        return item
    if not isinstance(item, dict):
        return str(item)

    item_type = item.get("type")
    if item_type == "text" or "text" in item:
        return str(item.get("text") or "")
    if item_type in {"image", "audio", "resource", "resource_link"}:
        mime = item.get("mimeType") or item.get("mime_type") or "unknown"
        return f"[non-text content type={item_type} mime={mime}]"
    if item_type == "embeddedResource":
        return "[non-text content type=embeddedResource]"
    return _safe_json(item)


def _safe_json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(value)


def _truncate(text: str, max_chars: int) -> str:
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    marker = "\n...[truncated]"
    keep = max(0, max_chars - len(marker))
    return text[:keep] + marker


def bound_error_message(message: Optional[str], max_chars: int = 500) -> str:
    """Return a safe, bounded error string."""
    if not message:
        return "Unknown error"
    cleaned = str(message).replace("\n", " ").strip()
    # Avoid leaking Authorization-looking substrings in messages
    lower = cleaned.lower()
    if "bearer " in lower or "authorization:" in lower:
        cleaned = "MCP request failed (details redacted)"
    return _truncate(cleaned, max_chars)

"""Fast heuristics for whether project chat needs corpus context."""

from __future__ import annotations

import re
from typing import Any, Optional, Sequence

# Short standalone greetings / closings that do not need documents.
_CASUAL_RE = re.compile(
    r"^\s*("
    r"hi|hello|hey|yo|sup|howdy|"
    r"good\s*(morning|afternoon|evening)|"
    r"thanks?(?:\s+you)?|thx|ty|"
    r"ok(?:ay)?|k|cool|great|nice|"
    r"bye|goodbye|see\s+ya|later|"
    r"test|ping|"
    r"how\s+are\s+you(?:\s+doing)?|"
    r"what'?s\s+up"
    r")[\s!.?]*$",
    re.IGNORECASE,
)

# Signals that the user is asking about project materials.
_PROJECT_SIGNAL_RE = re.compile(
    r"("
    r"\?|"
    r"\b(what|where|when|why|how|which|who|whose|whom)\b|"
    r"\b(explain|summarize|summary|compare|find|show|list|extract|"
    r"review|analyze|analyse|describe|draft|write|cite|"
    r"according\s+to|based\s+on|in\s+the\s+(doc|document|source|"
    r"contract|spec|drawing|pdf|note))\b|"
    r"\b(retainage|submittal|rfi|spec|drawing|contract|clause|"
    r"section|schedule|invoice|change\s+order)\b"
    r")",
    re.IGNORECASE,
)


def message_text(message: Any) -> str:
    """Extract plain text from a LangChain message or dict."""
    if message is None:
        return ""
    if isinstance(message, str):
        return message.strip()
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
            else:
                text = getattr(part, "text", None)
                if text:
                    parts.append(str(text))
        return " ".join(parts).strip()
    if content is None:
        return ""
    return str(content).strip()


def message_role(message: Any) -> str:
    """Normalize role/type for a message object."""
    if message is None:
        return ""
    msg_type = getattr(message, "type", None)
    if msg_type:
        return str(msg_type).lower()
    if isinstance(message, dict):
        role = message.get("role") or message.get("type") or ""
        return str(role).lower()
    return ""


def latest_user_message(messages: Optional[Sequence[Any]]) -> str:
    """Return the most recent human/user message text."""
    for message in reversed(list(messages or [])):
        role = message_role(message)
        if role in {"human", "user"}:
            return message_text(message)
    return ""


_SAVE_ARTIFACT_RE = re.compile(
    r"("
    r"\b(save|create|preserve|store|keep)\b.{0,40}\b("
    r"project\s+artifact|artifact|as\s+an?\s+artifact|to\s+the\s+project|"
    r"as\s+a\s+note"
    r")\b|"
    r"\b(save|create|preserve)\s+(this|that|it|the\s+output|the\s+result)\b|"
    r"\bsave\s+as\b"
    r")",
    re.IGNORECASE | re.DOTALL,
)


def requests_project_artifact_save(message: str) -> bool:
    """
    Return True when the user turn clearly asks to save/create/preserve
    a Project Artifact. Used as the server-side write gate for
    ``save_project_artifact``.
    """
    text = (message or "").strip()
    if not text:
        return False
    return bool(_SAVE_ARTIFACT_RE.search(text))


def needs_project_context(
    message: str,
    history: Optional[Sequence[Any]] = None,
) -> bool:
    """
    Return True when the reply should retrieve project documents.

    Casual greetings and short chitchat skip corpus context. Questions,
    document-oriented requests, longer messages, and mid-task follow-ups
    request retrieval.
    """
    text = (message or "").strip()
    if not text:
        return False

    if _CASUAL_RE.match(text):
        return False

    if _PROJECT_SIGNAL_RE.search(text):
        return True

    # Longer free-form messages are usually substantive.
    if len(text) >= 80:
        return True

    word_count = len(re.findall(r"\w+", text))
    if word_count >= 12:
        return True

    # Short follow-ups after a document-heavy turn still need context.
    if history:
        recent_user = [
            message_text(m)
            for m in list(history)[-6:]
            if message_role(m) in {"human", "user"}
        ]
        # Exclude the current message if it is already in history.
        prior = [t for t in recent_user if t and t.strip() != text]
        if any(needs_project_context(t, history=None) for t in prior[-2:]):
            # Pronoun / continuation cues
            if re.search(
                r"\b(it|that|this|they|those|these|more|also|and|"
                r"continue|elaborate|details?)\b",
                text,
                re.IGNORECASE,
            ):
                return True

    return False

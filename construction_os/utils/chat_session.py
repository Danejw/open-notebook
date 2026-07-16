"""Shared helpers for chat session IDs and LangGraph message hydration."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.artifact import ArtifactTemplate
from construction_os.domain.html_document import HtmlTemplate
from construction_os.domain.project import ChatSession
from construction_os.exceptions import NotFoundError
from construction_os.utils.html_media import expand_image_tokens


def normalize_chat_session_id(session_id: str) -> str:
    """Normalize a bare session identifier to its SurrealDB record ID."""
    if session_id.startswith("chat_session:"):
        return session_id
    return f"chat_session:{session_id}"


def normalize_source_id(source_id: str) -> str:
    """Normalize a bare source identifier to its SurrealDB record ID."""
    if source_id.startswith("source:"):
        return source_id
    return f"source:{source_id}"


def hydrate_langgraph_messages(
    thread_values: Optional[Dict[str, Any]],
    *,
    include_a2ui: bool = False,
) -> List[Dict[str, Any]]:
    """Extract API-ready message dicts from LangGraph thread state values."""
    messages: List[Dict[str, Any]] = []
    if not thread_values:
        return messages

    a2ui_by_message_id: Dict[str, Any] = {}
    if include_a2ui:
        raw_a2ui = thread_values.get("a2ui_by_message_id") or {}
        if isinstance(raw_a2ui, dict):
            a2ui_by_message_id = raw_a2ui

    for msg in thread_values.get("messages") or []:
        msg_id = getattr(msg, "id", f"msg_{len(messages)}")
        entry: Dict[str, Any] = {
            "id": msg_id,
            "type": msg.type if hasattr(msg, "type") else "unknown",
            "content": msg.content if hasattr(msg, "content") else str(msg),
            "timestamp": None,
        }
        if include_a2ui:
            payload = a2ui_by_message_id.get(str(msg_id))
            entry["a2ui_payload"] = payload if isinstance(payload, list) else None
        messages.append(entry)

    return messages


def session_record_fields(session: ChatSession) -> Dict[str, Any]:
    """Common ChatSession fields for project/source API response builders."""
    return {
        "id": session.id or "",
        "title": session.title or "Untitled Session",
        "model_override": getattr(session, "model_override", None),
        "skill_ids": getattr(session, "skill_ids", None) or [],
        "collection_ids": getattr(session, "collection_ids", None) or [],
        "html_template_id": getattr(session, "html_template_id", None),
        "created": str(session.created),
        "updated": str(session.updated),
    }


async def get_refers_to_out_id(session_id: str) -> Optional[str]:
    """Return the `refers_to` target record id for a chat session, if any."""
    full_session_id = normalize_chat_session_id(session_id)
    rows = await repo_query(
        "SELECT out FROM refers_to WHERE in = $session_id",
        {"session_id": ensure_record_id(full_session_id)},
    )
    if not rows:
        return None
    return str(rows[0]["out"])


async def session_refers_to(session_id: str, target_id: str) -> bool:
    """True when the session has a `refers_to` edge to the target record."""
    full_session_id = normalize_chat_session_id(session_id)
    rows = await repo_query(
        "SELECT * FROM refers_to WHERE in = $session_id AND out = $target_id LIMIT 1",
        {
            "session_id": ensure_record_id(full_session_id),
            "target_id": ensure_record_id(target_id),
        },
    )
    return bool(rows)


async def list_chat_sessions_for_out(target_id: str) -> List[ChatSession]:
    """Load ChatSession records linked to a target via ``refers_to.out``."""
    rows = await repo_query(
        "SELECT in FROM refers_to WHERE out = $target_id",
        {"target_id": ensure_record_id(target_id)},
    )
    sessions: List[ChatSession] = []
    for row in rows:
        session_id_raw = row.get("in")
        if not session_id_raw:
            continue
        session = await ChatSession.get(str(session_id_raw))
        if session:
            sessions.append(session)
    return sessions


def resolve_session_skill_ids(
    session: ChatSession,
    request_skill_ids: Optional[List[str]],
) -> List[str]:
    """Resolve skill ids from request override or session defaults; mutates session."""
    if request_skill_ids is not None:
        skill_ids = list(request_skill_ids)
        session.skill_ids = skill_ids
        return skill_ids
    return list(getattr(session, "skill_ids", None) or [])


def resolve_session_collection_ids(
    session: ChatSession,
    request_collection_ids: Optional[List[str]],
) -> List[str]:
    """Resolve collection ids from request override or session; mutates session."""
    if request_collection_ids is not None:
        collection_ids = list(request_collection_ids)
        session.collection_ids = collection_ids
        return collection_ids
    return list(getattr(session, "collection_ids", None) or [])


def resolve_session_html_template_id(
    session: ChatSession,
    request_html_template_id: Optional[str],
) -> Optional[str]:
    """Resolve html template id from request override or session; mutates session."""
    if request_html_template_id is not None:
        html_template_id = request_html_template_id or None
        session.html_template_id = html_template_id
        return html_template_id
    return getattr(session, "html_template_id", None)


async def resolve_html_template_meta(
    html_template_id: Optional[str],
    *,
    session: Optional[ChatSession] = None,
) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Load HtmlTemplate meta for forwarded props; clears session on missing template."""
    if not html_template_id:
        return None, None
    try:
        tmpl = await HtmlTemplate.get(html_template_id)
        html_body = await expand_image_tokens(tmpl.html_body)
        return html_template_id, {
            "id": tmpl.id,
            "name": tmpl.name,
            "category": tmpl.category,
            "html_body": html_body,
        }
    except NotFoundError:
        if session is not None:
            session.html_template_id = None
        return None, None


async def resolve_artifact_meta(
    artifact_id: Optional[str],
) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Load artifact meta for forwarded props; returns (None, None) when missing."""
    if not artifact_id:
        return None, None
    artifact_template = await ArtifactTemplate.get(artifact_id)
    if not artifact_template:
        return None, None
    return artifact_id, {
        "id": artifact_template.id,
        "name": artifact_template.name,
        "title": artifact_template.title,
        "description": artifact_template.description,
        "prompt": artifact_template.prompt,
    }

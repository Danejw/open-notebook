"""Compact, current-state memory for Construction OS project chats.

Project memory is deliberately separate from vector and graph retrieval. It stores one
small synthesized state per project, injects that state into the existing chat prompt,
and preserves source/note IDs so agents can verify important details against evidence.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Literal, Optional, Sequence

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field
from surreal_commands import submit_command

from construction_os.ai.provision import provision_langchain_model
from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.project import Note, Source
from construction_os.utils.text_utils import extract_text_content

_MEMORY_MAX_CHARS = 12_000
_CANDIDATE_MAX_CHARS = 16_000
_EVIDENCE_ITEM_MAX_CHARS = 6_000
_EVIDENCE_TOTAL_MAX_CHARS = 24_000
_MEMORY_ID_PREFIX = "project_memory"
_EVIDENCE_ID_RE = re.compile(r"\b(?:source|note):[A-Za-z0-9_-]+\b")
_TRIVIAL_CHAT_RE = re.compile(
    r"^\s*(?:hi|hello|hey|thanks|thank you|ok|okay|got it|yes|no|cool|great)[.!?\s]*$",
    re.IGNORECASE,
)


class ProjectMemorySnapshot(BaseModel):
    """One current, non-embedded memory state for a project."""

    project_id: str
    content: str
    evidence_ids: list[str] = Field(default_factory=list)
    revision: int = 0
    last_reason: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectMemoryDecision(BaseModel):
    """Strict consolidator response."""

    action: Literal["update", "noop"]
    content: str = ""
    evidence_ids: list[str] = Field(default_factory=list)


def _clip(value: Any, maximum: int) -> str:
    text = str(value or "").strip()
    if len(text) <= maximum:
        return text
    return text[: maximum - 15].rstrip() + "\n...[truncated]"


def project_memory_record_id(project_id: str) -> str:
    """Return a stable Surreal record ID without exposing the project ID as a key."""
    normalized = str(project_id or "").strip()
    if not normalized.startswith("project:"):
        raise ValueError("project_id must identify a project")
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]
    return f"{_MEMORY_ID_PREFIX}:{digest}"


def extract_evidence_ids(text: str) -> list[str]:
    """Extract stable source/note IDs in first-seen order."""
    seen: set[str] = set()
    ordered: list[str] = []
    for match in _EVIDENCE_ID_RE.findall(text or ""):
        if match not in seen:
            seen.add(match)
            ordered.append(match)
    return ordered


def should_consolidate_chat(user_text: str, assistant_text: str) -> bool:
    """Skip only clearly trivial turns; the consolidator performs final no-op filtering."""
    user = str(user_text or "").strip()
    assistant = str(assistant_text or "").strip()
    if not user or not assistant:
        return False
    return not bool(_TRIVIAL_CHAT_RE.fullmatch(user))


async def get_project_memory(project_id: str) -> Optional[ProjectMemorySnapshot]:
    """Load the current project memory, returning None when it has not been created."""
    memory_id = project_memory_record_id(project_id)
    rows = await repo_query(
        "SELECT * FROM $id",
        {"id": ensure_record_id(memory_id)},
    )
    if not rows:
        return None
    row = dict(rows[0])
    row.pop("id", None)
    try:
        return ProjectMemorySnapshot(**row)
    except Exception as exc:
        logger.warning("Ignoring invalid project memory {}: {}", memory_id, exc)
        return None


async def save_project_memory(
    *,
    project_id: str,
    content: str,
    evidence_ids: Sequence[str],
    revision: int,
    reason: str,
    created_at: Optional[str] = None,
) -> ProjectMemorySnapshot:
    """Upsert the single current memory record for a project."""
    now = datetime.now(timezone.utc).isoformat()
    snapshot = ProjectMemorySnapshot(
        project_id=project_id,
        content=_clip(content, _MEMORY_MAX_CHARS),
        evidence_ids=list(dict.fromkeys(str(item) for item in evidence_ids if item)),
        revision=max(1, int(revision)),
        last_reason=reason,
        created_at=created_at or now,
        updated_at=now,
    )
    await repo_query(
        "UPSERT $id CONTENT $memory",
        {
            "id": ensure_record_id(project_memory_record_id(project_id)),
            "memory": snapshot.model_dump(),
        },
    )
    return snapshot


async def delete_project_memory(project_id: str) -> None:
    """Delete a project's synthesized state. Intended for project cleanup flows."""
    await repo_query(
        "DELETE $id",
        {"id": ensure_record_id(project_memory_record_id(project_id))},
    )


def format_project_memory(snapshot: ProjectMemorySnapshot) -> str:
    """Render memory for prompt injection without presenting it as primary evidence."""
    evidence = ", ".join(snapshot.evidence_ids[:30]) or "none recorded"
    return (
        "# CURRENT PROJECT STATE\n\n"
        "This is a compact synthesized working state, not a replacement for source "
        "evidence. Verify consequential details against retrieved documents.\n\n"
        f"Revision: {snapshot.revision}\n"
        f"Updated: {snapshot.updated_at or 'unknown'}\n"
        f"Supporting evidence IDs: {evidence}\n\n"
        f"{snapshot.content.strip()}"
    )


async def inject_project_memory(
    payload: list[BaseMessage], *, project_id: str
) -> list[BaseMessage]:
    """Append current project state to the existing system prompt."""
    snapshot = await get_project_memory(project_id)
    if snapshot is None or not snapshot.content.strip():
        return list(payload)

    messages = list(payload)
    memory_block = format_project_memory(snapshot)
    for index, message in enumerate(messages):
        if isinstance(message, SystemMessage):
            base = extract_text_content(message.content).rstrip()
            messages[index] = message.model_copy(
                update={"content": f"{base}\n\n{memory_block}"}
            )
            return messages
    return [SystemMessage(content=memory_block), *messages]


async def _load_evidence(evidence_ids: Sequence[str]) -> str:
    blocks: list[str] = []
    total = 0
    for evidence_id in list(dict.fromkeys(evidence_ids))[:20]:
        try:
            if evidence_id.startswith("source:"):
                item = await Source.get(evidence_id)
                context = await item.get_context(context_size="long")
                title = context.get("title") or "Untitled source"
                content = context.get("full_text") or ""
            elif evidence_id.startswith("note:"):
                item = await Note.get(evidence_id)
                context = item.get_context(context_size="long")
                title = context.get("title") or "Untitled artifact"
                content = context.get("content") or ""
            else:
                continue
        except Exception as exc:
            logger.debug("Skipping memory evidence {}: {}", evidence_id, exc)
            continue

        block = (
            f"## {evidence_id} — {title}\n"
            f"{_clip(content, _EVIDENCE_ITEM_MAX_CHARS)}"
        ).strip()
        if not block:
            continue
        if total + len(block) > _EVIDENCE_TOTAL_MAX_CHARS:
            break
        blocks.append(block)
        total += len(block)
    return "\n\n".join(blocks)


def _decision_from_fallback(content: Any) -> ProjectMemoryDecision:
    text = extract_text_content(content).strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("Project memory consolidator did not return JSON")
    return ProjectMemoryDecision(**json.loads(candidate[start : end + 1]))


async def consolidate_project_memory(
    *,
    project_id: str,
    reason: str,
    candidate_text: Optional[str] = None,
    evidence_ids: Optional[Sequence[str]] = None,
    model_id: Optional[str] = None,
) -> tuple[ProjectMemorySnapshot | None, bool]:
    """Merge one event into the project's current state, or deliberately no-op."""
    previous = await get_project_memory(project_id)
    requested_evidence = list(dict.fromkeys(evidence_ids or []))
    evidence_text = await _load_evidence(requested_evidence)
    previous_text = previous.content if previous else "No project memory exists yet."

    messages: list[BaseMessage] = [
        SystemMessage(
            content=(
                "You maintain one concise current-state memory for a construction "
                "project. Update only durable project truth: current status, active "
                "scope and requirements, confirmed decisions, deadlines, risks, open "
                "questions, and next actions. Newer reliable information supersedes "
                "older state. Preserve uncertainty when facts conflict. Do not copy a "
                "conversation transcript, add opinions, or invent facts. Return action "
                "noop when the event adds no durable change. When updating, produce "
                "clear Markdown under 900 words and retain only evidence IDs that "
                "support the resulting state."
            )
        ),
        HumanMessage(
            content=(
                f"PROJECT ID\n{project_id}\n\n"
                f"UPDATE REASON\n{reason}\n\n"
                "PREVIOUS CURRENT STATE\n"
                f"{_clip(previous_text, _MEMORY_MAX_CHARS)}\n\n"
                "NEW EVENT OR CHAT RESULT\n"
                f"{_clip(candidate_text, _CANDIDATE_MAX_CHARS) or 'None supplied'}\n\n"
                "DIRECT SUPPORTING EVIDENCE\n"
                f"{evidence_text or 'No direct evidence text supplied.'}\n\n"
                "AVAILABLE EVIDENCE IDS\n"
                f"{json.dumps(requested_evidence, ensure_ascii=False)}"
            )
        ),
    ]

    model = await provision_langchain_model(
        str(messages), model_id, "chat", max_tokens=1800
    )
    try:
        decision = await model.with_structured_output(
            ProjectMemoryDecision
        ).ainvoke(messages)
        if not isinstance(decision, ProjectMemoryDecision):
            decision = ProjectMemoryDecision(**decision)
    except Exception as structured_error:
        logger.warning(
            "Structured project memory consolidation failed for {}: {}",
            project_id,
            structured_error,
        )
        fallback = await model.ainvoke(
            messages
            + [
                HumanMessage(
                    content=(
                        "Return only JSON with keys action, content, and evidence_ids."
                    )
                )
            ]
        )
        decision = _decision_from_fallback(fallback.content)

    if decision.action == "noop" or not decision.content.strip():
        return previous, False

    allowed_ids = set(requested_evidence)
    if previous:
        allowed_ids.update(previous.evidence_ids)
    retained_ids = [item for item in decision.evidence_ids if item in allowed_ids]
    if not retained_ids:
        retained_ids = list(dict.fromkeys([*(previous.evidence_ids if previous else []), *requested_evidence]))

    snapshot = await save_project_memory(
        project_id=project_id,
        content=decision.content,
        evidence_ids=retained_ids,
        revision=(previous.revision if previous else 0) + 1,
        reason=reason,
        created_at=previous.created_at if previous else None,
    )
    return snapshot, True


def schedule_project_memory_consolidation(
    *,
    project_id: str,
    reason: str,
    candidate_text: Optional[str] = None,
    evidence_ids: Optional[Sequence[str]] = None,
    model_id: Optional[str] = None,
) -> Optional[str]:
    """Queue consolidation without delaying or failing the primary project action."""
    try:
        command_id = submit_command(
            "construction_os",
            "consolidate_project_memory",
            {
                "project_id": project_id,
                "reason": reason,
                "candidate_text": _clip(candidate_text, _CANDIDATE_MAX_CHARS) or None,
                "evidence_ids": list(dict.fromkeys(evidence_ids or []))[:30],
                "model_id": model_id,
            },
        )
        return str(command_id)
    except Exception as exc:
        logger.warning(
            "Unable to queue project memory consolidation for {}: {}",
            project_id,
            exc,
        )
        return None

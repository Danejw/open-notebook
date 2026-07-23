"""Shared Project Artifact create helpers (API + native tools)."""

from __future__ import annotations

from typing import Any, Optional

from loguru import logger

from construction_os.database.repository import repo_query
from construction_os.domain.project import Project
from construction_os.domain.project_artifact import (
    AUTO_TITLE_KINDS,
    ProjectArtifact,
    resolve_kind_from_payload,
)
from construction_os.exceptions import InvalidInputError

_FALLBACK_TITLE_WORD_LIMIT = 12


def fallback_artifact_title(content: str) -> str:
    """Deterministic title from content when LLM title generation is unavailable."""
    words = " ".join(str(content).split()).strip()
    if not words:
        return "Untitled Artifact"
    parts = words.split(" ")
    title = " ".join(parts[:_FALLBACK_TITLE_WORD_LIMIT])
    if len(parts) > _FALLBACK_TITLE_WORD_LIMIT:
        title = f"{title}…"
    return title


async def generate_artifact_title(content: str, kind: str) -> str:
    from construction_os.graphs.prompt import graph as prompt_graph

    if kind == "generated":
        prompt = (
            "Based on the artifact content below, provide a concise descriptive title "
            "(max 15 words) for a construction project artifact."
        )
    else:
        prompt = (
            "Based on the project artifact below, please provide a Title for this "
            "content, with max 15 words"
        )

    try:
        result = await prompt_graph.ainvoke(
            {  # type: ignore[arg-type]
                "input_text": content,
                "prompt": prompt,
            }
        )
        output = result.get("output")
        if isinstance(output, str) and output.strip():
            return output.strip()
    except Exception as e:
        logger.warning(
            f"Artifact title generation failed ({e}); using fallback title"
        )

    return fallback_artifact_title(content)


def project_artifact_to_dict(
    artifact: ProjectArtifact,
    command_id: Optional[str] = None,
) -> dict[str, Any]:
    kind = artifact.artifact_kind
    return {
        "id": artifact.id or "",
        "title": artifact.title,
        "content": artifact.content,
        "artifact_kind": kind,
        "note_type": kind,
        "save_idempotency_key": getattr(artifact, "save_idempotency_key", None),
        "created": str(artifact.created) if artifact.created else None,
        "updated": str(artifact.updated) if artifact.updated else None,
        "command_id": str(command_id) if command_id else None,
    }


async def find_by_idempotency_key(key: str) -> Optional[ProjectArtifact]:
    if not key:
        return None
    rows = await repo_query(
        "SELECT * FROM note WHERE save_idempotency_key = $key LIMIT 1",
        {"key": key},
    )
    if not rows:
        return None
    return ProjectArtifact(**rows[0])


async def create_project_artifact(
    *,
    content: str,
    project_id: Optional[str] = None,
    title: Optional[str] = None,
    artifact_kind: Optional[str] = None,
    note_type: Optional[str] = None,
    save_idempotency_key: Optional[str] = None,
) -> dict[str, Any]:
    """Create a Project Artifact, optionally linked to a project."""
    if not content or not str(content).strip():
        raise InvalidInputError("Project artifact content cannot be empty")

    if save_idempotency_key:
        existing = await find_by_idempotency_key(save_idempotency_key)
        if existing:
            return {
                **project_artifact_to_dict(existing),
                "idempotent_replay": True,
            }

    kind = resolve_kind_from_payload(
        artifact_kind=artifact_kind,
        note_type=note_type,
        default="manual",
    )
    resolved_title = title
    if not resolved_title and kind in AUTO_TITLE_KINDS:
        resolved_title = await generate_artifact_title(content, kind or "manual")

    artifact = ProjectArtifact(
        title=resolved_title,
        content=content,
        note_type=kind,
        save_idempotency_key=save_idempotency_key,
    )
    command_id = await artifact.save()

    if project_id:
        await Project.get(project_id)
        await artifact.add_to_project(project_id)

    return {
        **project_artifact_to_dict(artifact, command_id),
        "idempotent_replay": False,
    }

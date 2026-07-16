"""Centralized project-scope checks for native capability handlers."""

from __future__ import annotations

from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.utils.chat_session import session_refers_to


async def require_project_session(ctx: CapabilityRuntimeContext) -> None:
    """
    Ensure the trusted runtime project/session pair is valid.

    Project and session IDs come from server runtime context, never tool args.
    This is the extension point for future per-project RBAC.
    """
    if not ctx.project_id:
        raise InvalidInputError("Active project is required")
    if not ctx.session_id:
        raise InvalidInputError("Active chat session is required")
    if ctx.is_guest:
        raise InvalidInputError("Native tools are not available for guest chats")
    linked = await session_refers_to(ctx.session_id, ctx.project_id)
    if not linked:
        raise NotFoundError("Chat session is not linked to the active project")


def require_project_artifact_save(ctx: CapabilityRuntimeContext) -> None:
    """Server-side write gate for save_project_artifact."""
    if not ctx.allow_project_artifact_save:
        raise InvalidInputError(
            "Saving a Project Artifact is only allowed when the user "
            "explicitly asks to save, create, or preserve the output."
        )

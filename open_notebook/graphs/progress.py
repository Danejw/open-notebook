"""Emit AG-UI-compatible agent progress custom events from LangGraph nodes."""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from langchain_core.callbacks.manager import adispatch_custom_event, dispatch_custom_event
from langchain_core.runnables import RunnableConfig

AGENT_PROGRESS_EVENT = "agent_progress"

ProgressPhase = Literal["started", "progress", "completed"]


def emit_agent_progress(
    phase: ProgressPhase,
    step: str,
    detail: Optional[Dict[str, Any]] = None,
    config: Optional[RunnableConfig] = None,
) -> None:
    """Emit a sync custom event (for sync LangGraph nodes)."""
    dispatch_custom_event(
        AGENT_PROGRESS_EVENT,
        {"phase": phase, "step": step, "detail": detail or {}},
        config=config,
    )


async def aemit_agent_progress(
    phase: ProgressPhase,
    step: str,
    detail: Optional[Dict[str, Any]] = None,
    config: Optional[RunnableConfig] = None,
) -> None:
    """Emit an async custom event (for async LangGraph nodes)."""
    await adispatch_custom_event(
        AGENT_PROGRESS_EVENT,
        {"phase": phase, "step": step, "detail": detail or {}},
        config=config,
    )

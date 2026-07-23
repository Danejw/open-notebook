"""AG-UI streaming helpers for LangGraph agents."""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, Optional

from ag_ui.core import EventType, RunAgentInput, RunErrorEvent
from ag_ui.encoder import EventEncoder
from ag_ui_langgraph import LangGraphAgent
from fastapi.responses import StreamingResponse
from loguru import logger

from construction_os.exceptions import ConstructionOSError
from construction_os.graphs import ag_ui_runtime
from construction_os.graphs.ag_ui_runtime import (
    build_run_input,
    build_user_message,
    iterate_agent_events,
)
from construction_os.utils.error_classifier import classify_error

project_chat_agent = ag_ui_runtime.project_chat_agent

__all__ = [
    "ag_ui_streaming_response",
    "build_run_input",
    "build_user_message",
    "iterate_agent_events",
    "project_chat_agent",
    "refresh_agents",
    "stream_agent_events",
]


def refresh_agents() -> None:
    """Rebind AG-UI agents after chat graphs are compiled with AsyncSqliteSaver."""
    global project_chat_agent
    ag_ui_runtime.refresh_agents()
    project_chat_agent = ag_ui_runtime.project_chat_agent


def _sse_headers() -> Dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }


async def stream_agent_events(
    agent: LangGraphAgent,
    run_input: RunAgentInput,
    *,
    configurable: Optional[Dict[str, Any]] = None,
    accept: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Encode raw runtime events as SSE and convert failures to RUN_ERROR."""
    encoder = EventEncoder(accept=accept)

    try:
        async for event in iterate_agent_events(
            agent, run_input, configurable=configurable
        ):
            yield encoder.encode(event)
    except Exception as e:
        _, user_message = classify_error(e)
        cause = e.__cause__
        if cause is not None:
            logger.exception(
                "AG-UI agent stream error: {} (cause: {})",
                e,
                cause,
            )
        elif isinstance(e, ConstructionOSError):
            logger.error("AG-UI agent stream error: {}", e)
        else:
            logger.exception("AG-UI agent stream error: {}", e)
        yield encoder.encode(
            RunErrorEvent(type=EventType.RUN_ERROR, message=user_message)
        )


def ag_ui_streaming_response(
    agent: LangGraphAgent,
    run_input: RunAgentInput,
    *,
    configurable: Optional[Dict[str, Any]] = None,
    accept: Optional[str] = None,
) -> StreamingResponse:
    """Return a StreamingResponse of AG-UI SSE events."""
    encoder = EventEncoder(accept=accept)
    return StreamingResponse(
        stream_agent_events(agent, run_input, configurable=configurable, accept=accept),
        media_type=encoder.get_content_type(),
        headers=_sse_headers(),
    )

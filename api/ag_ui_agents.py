"""AG-UI streaming helpers for LangGraph agents."""

from __future__ import annotations

import uuid
from typing import Any, AsyncGenerator, Dict, Optional

from ag_ui.core import RunAgentInput, UserMessage
from ag_ui.encoder import EventEncoder
from ag_ui_langgraph import LangGraphAgent
from fastapi.responses import StreamingResponse
from loguru import logger

from open_notebook.graphs import ask as ask_module
from open_notebook.graphs import chat as chat_module
from open_notebook.graphs import source_chat as source_chat_module
from open_notebook.utils.error_classifier import classify_error

notebook_chat_agent = LangGraphAgent(name="notebook_chat", graph=chat_module.graph)
source_chat_agent = LangGraphAgent(
    name="source_chat", graph=source_chat_module.source_chat_graph
)
ask_agent = LangGraphAgent(name="ask", graph=ask_module.graph)


def refresh_agents() -> None:
    """Rebind AG-UI agents after chat graphs are compiled with AsyncSqliteSaver."""
    global notebook_chat_agent, source_chat_agent, ask_agent
    notebook_chat_agent = LangGraphAgent(name="notebook_chat", graph=chat_module.graph)
    source_chat_agent = LangGraphAgent(
        name="source_chat", graph=source_chat_module.source_chat_graph
    )
    ask_agent = LangGraphAgent(name="ask", graph=ask_module.graph)
    logger.info("AG-UI LangGraph agents refreshed with current graphs")


def _sse_headers() -> Dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }


def build_user_message(content: str, message_id: Optional[str] = None) -> UserMessage:
    """Build an AG-UI user message for RunAgentInput."""
    return UserMessage(
        id=message_id or str(uuid.uuid4()),
        role="user",
        content=content,
    )


def build_run_input(
    *,
    thread_id: str,
    message: Optional[str] = None,
    message_id: Optional[str] = None,
    state: Optional[Dict[str, Any]] = None,
    forwarded_props: Optional[Dict[str, Any]] = None,
    messages: Optional[list] = None,
) -> RunAgentInput:
    """Construct RunAgentInput for a thin domain adapter."""
    run_messages = messages
    if run_messages is None:
        run_messages = (
            [build_user_message(message, message_id)] if message is not None else []
        )
    return RunAgentInput(
        thread_id=thread_id,
        run_id=str(uuid.uuid4()),
        messages=run_messages,
        state=state or {},
        tools=[],
        context=[],
        forwarded_props=forwarded_props or {},
    )


async def stream_agent_events(
    agent: LangGraphAgent,
    run_input: RunAgentInput,
    *,
    configurable: Optional[Dict[str, Any]] = None,
    accept: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Clone agent, run, and yield AG-UI-encoded SSE chunks."""
    encoder = EventEncoder(accept=accept)
    request_agent = agent.clone()
    if configurable:
        base_config: Dict[str, Any] = dict(request_agent.config or {})
        base_configurable = dict(base_config.get("configurable") or {})
        base_configurable.update(configurable)
        base_config["configurable"] = base_configurable
        request_agent.config = base_config

    try:
        async for event in request_agent.run(run_input):
            yield encoder.encode(event)
    except Exception as e:
        _, user_message = classify_error(e)
        logger.error(f"AG-UI agent stream error: {e}")
        from ag_ui.core import EventType, RunErrorEvent

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
        stream_agent_events(
            agent, run_input, configurable=configurable, accept=accept
        ),
        media_type=encoder.get_content_type(),
        headers=_sse_headers(),
    )

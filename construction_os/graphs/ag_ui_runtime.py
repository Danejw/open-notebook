"""Reusable non-HTTP AG-UI runtime primitives for LangGraph agents."""

from __future__ import annotations

import uuid
from typing import Any, AsyncGenerator, Dict, Optional

from ag_ui.core import RunAgentInput, UserMessage
from ag_ui_langgraph import LangGraphAgent
from loguru import logger

from construction_os.graphs import chat as chat_module


def build_agent(name: str, graph: Any) -> LangGraphAgent:
    """Construct an AG-UI LangGraph agent for a supplied compiled graph."""
    return LangGraphAgent(name=name, graph=graph)


project_chat_agent = build_agent("project_chat", chat_module.graph)


def refresh_agents() -> None:
    """Rebuild process-global API agents after their graphs are rebound."""
    global project_chat_agent
    project_chat_agent = build_agent("project_chat", chat_module.graph)
    logger.info("AG-UI LangGraph agents refreshed with current graphs")


def build_user_message(content: str, message_id: Optional[str] = None) -> UserMessage:
    """Build an AG-UI user message with an optional stable identifier."""
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
    """Construct a protocol run input independently of any HTTP transport."""
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


def clone_agent(
    agent: LangGraphAgent,
    *,
    configurable: Optional[Dict[str, Any]] = None,
) -> LangGraphAgent:
    """Clone an agent and merge request-scoped configurable values."""
    request_agent = agent.clone()
    if configurable:
        base_config: Dict[str, Any] = dict(request_agent.config or {})
        base_configurable = dict(base_config.get("configurable") or {})
        base_configurable.update(configurable)
        base_config["configurable"] = base_configurable
        request_agent.config = base_config
    return request_agent


async def iterate_agent_events(
    agent: LangGraphAgent,
    run_input: RunAgentInput,
    *,
    configurable: Optional[Dict[str, Any]] = None,
) -> AsyncGenerator[Any, None]:
    """Yield raw AG-UI events from an isolated request agent clone."""
    request_agent = clone_agent(agent, configurable=configurable)
    async for event in request_agent.run(run_input):
        yield event

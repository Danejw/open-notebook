"""Unified model + native/MCP tool execution loop for chat graphs."""

from __future__ import annotations

from typing import Any, Callable, Optional

from langchain_core.callbacks.manager import dispatch_custom_event
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from loguru import logger

from construction_os.capabilities.langchain_bridge import build_native_langchain_tools
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.graphs.progress import emit_citation_verify_progress
from construction_os.mcp.allowlist import build_allowlist
from construction_os.mcp.langgraph_tools import build_langchain_tools
from construction_os.mcp.limits import MAX_TOOL_CALLS, MAX_TOOL_ITERATIONS
from construction_os.services.html_template_binding import (
    attach_rendered_html,
    render_selected_html_template,
)
from construction_os.services.project_memory import (
    extract_evidence_ids,
    inject_project_memory,
    schedule_project_memory_consolidation,
    should_consolidate_chat,
)
from construction_os.tool_runtime.execution import (
    DuplicateCallGuard,
    reject_unauthorized,
)
from construction_os.utils.citation_verify import (
    collect_evidence_ids_from_texts,
    strip_unverified_citations,
)
from construction_os.utils.text_utils import extract_text_content

HTML_TEMPLATE_OUTPUT_EVENT = "html_template_output"


def emit_html_template_output(
    *,
    message_id: str,
    template_id: str,
    html: str,
    config: Optional[RunnableConfig],
) -> bool:
    """Emit one completed HTML document as a first-class AG-UI custom event."""
    if not config:
        return False
    try:
        dispatch_custom_event(
            HTML_TEMPLATE_OUTPUT_EVENT,
            {
                "messageId": message_id,
                "templateId": template_id,
                "html": html,
            },
            config=config,
        )
        return True
    except Exception as error:
        logger.warning(
            "Unable to stream HTML template output {} for message {}: {}",
            template_id,
            message_id,
            error,
        )
        return False


def _latest_human_text(messages: list[BaseMessage]) -> str:
    """Return the latest human message without including system/tool context."""
    for message in reversed(messages):
        if isinstance(message, HumanMessage) or getattr(message, "type", None) == "human":
            return extract_text_content(message.content).strip()
    return ""


def _system_evidence_ids(messages: list[BaseMessage]) -> list[str]:
    """Collect source/note IDs already retrieved into the grounded system prompt."""
    system_text = "\n".join(
        extract_text_content(message.content)
        for message in messages
        if isinstance(message, SystemMessage)
        or getattr(message, "type", None) == "system"
    )
    return extract_evidence_ids(system_text)


def _turn_evidence_ids(messages: list[BaseMessage]) -> list[str]:
    """Evidence IDs from system context and tool results for this turn."""
    texts: list[str] = []
    for message in messages:
        msg_type = getattr(message, "type", None)
        if (
            isinstance(message, (SystemMessage, ToolMessage))
            or msg_type in {"system", "tool"}
        ):
            texts.append(extract_text_content(message.content))
    return collect_evidence_ids_from_texts(texts)


async def generate_with_tools(
    *,
    provision_model: Callable[..., Any],
    payload: list[BaseMessage],
    model_id: Optional[str],
    mcp_tool_ids: Optional[list],
    session_id: str,
    message_id: Optional[str] = None,
    config: Optional[RunnableConfig] = None,
    strict_mcp_tools: bool = False,
    capability_context: Optional[CapabilityRuntimeContext] = None,
) -> AIMessage:
    """
    Invoke the chat model, binding native and/or MCP tools in one bounded loop.

    `provision_model` should be an async callable matching provision_langchain_model.
    """
    effective_payload = list(payload)
    if capability_context is not None and not capability_context.is_guest:
        try:
            effective_payload = await inject_project_memory(
                effective_payload,
                project_id=capability_context.project_id,
            )
        except Exception as error:
            # Memory is an augmentation. It must never block grounded project chat.
            logger.warning(
                "Unable to inject project memory for {}: {}",
                capability_context.project_id,
                error,
            )

    model = await provision_model(
        str(effective_payload), model_id, "chat", max_tokens=8192
    )
    allowlist = await build_allowlist(
        mcp_tool_ids,
        strict_selected_tools=strict_mcp_tools,
    )
    guard = DuplicateCallGuard()
    tools: list[BaseTool] = []

    if capability_context is not None:
        # Keep message_id in sync for audit rows
        if message_id and not capability_context.message_id:
            capability_context.message_id = message_id
        tools.extend(
            build_native_langchain_tools(
                capability_context,
                guard=guard,
                config=config,
            )
        )

    tools.extend(
        build_langchain_tools(
            allowlist,
            session_id=session_id,
            message_id=message_id,
            guard=guard,
            config=config,
        )
    )

    if tools:
        model = model.bind_tools(tools)

    invoke_config = config or {}
    working: list[BaseMessage] = list(effective_payload)
    call_count = 0
    ai_message: AIMessage | None = None

    for _ in range(MAX_TOOL_ITERATIONS if tools else 1):
        ai_message = model.invoke(working, config=invoke_config)
        tool_calls = getattr(ai_message, "tool_calls", None) or []
        if not tool_calls:
            break
        if not tools:
            for tc in tool_calls:
                await reject_unauthorized(
                    session_id=session_id,
                    runtime_name=tc.get("name") or "",
                    arguments=tc.get("args") or {},
                    message_id=message_id,
                    config=config,
                )
            break

        working.append(ai_message)
        for tc in tool_calls:
            if call_count >= MAX_TOOL_CALLS:
                working.append(
                    ToolMessage(
                        content="Tool call limit reached for this turn.",
                        tool_call_id=tc.get("id") or "limit",
                    )
                )
                continue
            call_count += 1
            name = tc.get("name") or ""
            args = tc.get("args") or {}
            matched = next((t for t in tools if t.name == name), None)
            if matched is None:
                await reject_unauthorized(
                    session_id=session_id,
                    runtime_name=name,
                    arguments=args,
                    message_id=message_id,
                    config=config,
                )
                working.append(
                    ToolMessage(
                        content=(
                            "Tool rejected: not in the authorized allowlist. "
                            "Do not retry the same unauthorized request."
                        ),
                        tool_call_id=tc.get("id") or name,
                    )
                )
                continue
            # Pass tool_call_id for native save idempotency when supported
            invoke_args = dict(args)
            result_text = await matched.ainvoke(invoke_args, config=invoke_config)
            working.append(
                ToolMessage(
                    content=str(result_text),
                    tool_call_id=tc.get("id") or name,
                )
            )
            # After native save, stash tool_call_id on context for idempotency
            # handlers that accept it via kwargs already handled inside bridge.
            if (
                capability_context is not None
                and name.startswith("native__save_project_artifact")
                and tc.get("id")
            ):
                # Re-run is unnecessary; bridge uses message_id fallback.
                pass
    else:
        if (
            tools
            and ai_message is not None
            and (getattr(ai_message, "tool_calls", None) or [])
        ):
            plain = await provision_model(
                str(working), model_id, "chat", max_tokens=8192
            )
            ai_message = plain.invoke(working, config=invoke_config)

    assert ai_message is not None
    canonical_assistant_text = extract_text_content(ai_message.content)

    # RAG-002: drop citations that were never in this turn's retrieved evidence.
    citation_check = strip_unverified_citations(
        canonical_assistant_text,
        allowed_ids=_turn_evidence_ids(working),
    )
    # RAG-015: structured operator telemetry (counts always; IDs when stripped).
    emit_citation_verify_progress(
        removed_ids=citation_check.removed_ids,
        kept_ids=citation_check.kept_ids,
        config=config,
    )
    if citation_check.removed_ids:
        logger.info(
            "Stripped {} unverified citation(s): {}",
            len(citation_check.removed_ids),
            citation_check.removed_ids,
        )
        canonical_assistant_text = citation_check.text
        ai_message = ai_message.model_copy(
            update={"content": canonical_assistant_text}
        )

    html_template_id = (
        capability_context.explicit_html_template_id
        if capability_context is not None
        else None
    )
    if html_template_id:
        try:
            rendered_html = await render_selected_html_template(
                template_id=html_template_id,
                assistant_text=canonical_assistant_text,
                grounding_messages=working,
                model_id=model_id,
                provision_model=provision_model,
                config=None,
            )
            if message_id:
                emit_html_template_output(
                    message_id=message_id,
                    template_id=html_template_id,
                    html=rendered_html,
                    config=config,
                )
            ai_message = ai_message.model_copy(
                update={
                    "content": attach_rendered_html(
                        canonical_assistant_text,
                        rendered_html,
                    )
                }
            )
        except Exception as error:
            # A template failure must not discard the normal answer or A2UI output.
            logger.error(
                "Unable to attach selected HTML template {}: {}",
                html_template_id,
                error,
            )

    if capability_context is not None and not capability_context.is_guest:
        user_text = _latest_human_text(effective_payload)
        if should_consolidate_chat(user_text, canonical_assistant_text):
            schedule_project_memory_consolidation(
                project_id=capability_context.project_id,
                reason="project_chat_completed",
                candidate_text=(
                    f"USER MESSAGE\n{user_text}\n\n"
                    f"ASSISTANT RESULT\n{canonical_assistant_text}"
                ),
                evidence_ids=_system_evidence_ids(effective_payload),
                model_id=model_id,
            )

    if message_id:
        ai_message = ai_message.model_copy(update={"id": message_id})
    return ai_message

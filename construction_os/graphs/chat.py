import asyncio
import concurrent.futures
import uuid
from typing import Annotated, Literal, Optional

from ai_prompter import Prompter
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from construction_os.ai.provision import provision_langchain_model
from construction_os.domain.artifact import DefaultPrompts
from construction_os.domain.project import Project
from construction_os.exceptions import ConstructionOSError
from construction_os.graphs.chat_context import build_relevance_context
from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.graphs.chat_intent import (
    latest_user_message,
    needs_project_context,
    requests_project_artifact_save,
)
from construction_os.graphs.progress import (
    EMPTY_TOOL_TURN_FALLBACK,
    emit_agent_progress,
    emit_assistant_text_message,
    emit_evidence_focus,
)
from construction_os.graphs.a2ui_emit import (
    format_a2ui_agent_catalog,
    is_a2ui_chat_enabled,
)
from construction_os.tool_runtime.chat_loop import generate_with_tools
from construction_os.collections.loader import (
    format_collections_context,
    load_one_collection_block,
)
from construction_os.skills.loader import (
    format_skills_context,
    load_one_skill_md,
)
from construction_os.utils import clean_thinking_content
from construction_os.utils.error_classifier import classify_error
from construction_os.utils.text_utils import extract_text_content
from construction_os.utils.token_utils import token_count


class ThreadState(TypedDict):
    messages: Annotated[list, add_messages]
    project: Optional[Project | dict]
    project_id: Optional[str]
    context: Optional[str | dict]
    context_config: Optional[dict]
    model_override: Optional[str]
    skills_context: Optional[str]
    skill_ids: Optional[list]
    collections_context: Optional[str]
    collection_ids: Optional[list]
    mcp_tool_ids: Optional[list]
    strict_mcp_tools: bool
    session_id: Optional[str]
    is_guest: bool
    html_template_id: Optional[str]
    html_template: Optional[dict]
    artifact_id: Optional[str]
    artifact: Optional[dict]
    artifact_instructions: Optional[str]
    a2ui_pending: Optional[list]
    a2ui_by_message_id: Optional[dict]


def _run_async(coro):
    """Run an async coroutine from a sync LangGraph node."""

    def run_in_new_loop():
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(coro)
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as executor:
            return executor.submit(run_in_new_loop).result()
    except RuntimeError:
        return asyncio.run(coro)


def _format_project_context(context: Optional[str | dict]) -> Optional[str]:
    """Normalize Project context payload into prompt text."""
    if context is None:
        return None
    if isinstance(context, str):
        return context
    if isinstance(context, dict):
        parts: list[str] = []
        sources = context.get("sources") or context.get("Sources") or []
        notes = context.get("notes") or context.get("Notes") or []
        if isinstance(sources, list) and sources:
            parts.append("## Sources")
            for item in sources:
                parts.append(str(item))
            parts.append("")
        if isinstance(notes, list) and notes:
            parts.append("## Notes")
            for item in notes:
                parts.append(str(item))
            parts.append("")
        if parts:
            return "\n".join(parts).strip()
        return "\n".join(f"**{k}:** {v}" for k, v in context.items())
    return str(context)


def _context_counts(context: Optional[str | dict], formatted: Optional[str]) -> dict:
    """Derive source/note/token counts for progress events."""
    source_count = 0
    note_count = 0
    if isinstance(context, dict):
        sources = context.get("sources") or []
        notes = context.get("notes") or []
        source_count = len(sources) if isinstance(sources, list) else 0
        note_count = len(notes) if isinstance(notes, list) else 0
        if context.get("total_tokens") is not None:
            return {
                "sourceCount": source_count,
                "noteCount": note_count,
                "tokenCount": int(context["total_tokens"]),
            }
    text = formatted or ""
    return {
        "sourceCount": source_count,
        "noteCount": note_count,
        "tokenCount": token_count(text) if text else 0,
    }


def route_from_start(
    state: ThreadState,
) -> Literal["loading_skills", "loading_collections", "retrieving_context"]:
    if state.get("skill_ids"):
        return "loading_skills"
    if state.get("collection_ids"):
        return "loading_collections"
    return "retrieving_context"


def route_after_skills(
    state: ThreadState,
) -> Literal["loading_collections", "retrieving_context"]:
    if state.get("collection_ids"):
        return "loading_collections"
    return "retrieving_context"


def loading_skills(state: ThreadState, config: RunnableConfig) -> dict:
    """Load selected SKILL.md bodies one-by-one with progress events."""
    try:
        skill_ids = list(state.get("skill_ids") or [])
        total = len(skill_ids)
        emit_agent_progress(
            "started",
            "loading_skills",
            {"skillTotal": total},
            config,
        )
        if not skill_ids:
            return {"skills_context": None}

        blocks: list[str] = []
        for index, skill_id in enumerate(skill_ids, start=1):
            emit_agent_progress(
                "progress",
                "loading_skills",
                {
                    "skillId": skill_id,
                    "skillIndex": index,
                    "skillTotal": total,
                },
                config,
            )
            loaded = _run_async(load_one_skill_md(skill_id))
            blocks.append(loaded["block"])
            emit_agent_progress(
                "completed",
                "loading_skills",
                {
                    "skillId": loaded.get("id") or skill_id,
                    "skillName": loaded["name"],
                    "skillIndex": index,
                    "skillTotal": total,
                    "charCount": loaded.get("char_count", 0),
                },
                config,
            )

        return {"skills_context": format_skills_context(blocks) or None}
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


def loading_collections(state: ThreadState, config: RunnableConfig) -> dict:
    """Load selected collection manifests and URL items with progress events."""
    try:
        collection_ids = list(state.get("collection_ids") or [])
        total = len(collection_ids)
        emit_agent_progress(
            "started",
            "loading_collections",
            {"collectionTotal": total},
            config,
        )
        if not collection_ids:
            return {"collections_context": None}

        blocks: list[str] = []
        for index, collection_id in enumerate(collection_ids, start=1):
            emit_agent_progress(
                "progress",
                "loading_collections",
                {
                    "collectionId": collection_id,
                    "collectionIndex": index,
                    "collectionTotal": total,
                },
                config,
            )
            loaded = _run_async(load_one_collection_block(collection_id))
            blocks.append(loaded["block"])
            emit_agent_progress(
                "completed",
                "loading_collections",
                {
                    "collectionId": loaded.get("id") or collection_id,
                    "collectionName": loaded["name"],
                    "collectionIndex": index,
                    "collectionTotal": total,
                    "charCount": loaded.get("char_count", 0),
                },
                config,
            )

        return {"collections_context": format_collections_context(blocks) or None}
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


def retrieving_context(state: ThreadState, config: RunnableConfig) -> dict:
    """Retrieve query-scoped Project context with count/token progress events."""
    try:
        emit_agent_progress("started", "retrieving_context", {}, config)

        context_config = state.get("context_config")
        project_id = state.get("project_id")
        if not project_id and isinstance(state.get("project"), dict):
            project_id = state["project"].get("id")  # type: ignore[index]
        elif not project_id and state.get("project") is not None:
            project_id = getattr(state.get("project"), "id", None)

        messages = state.get("messages") or []
        user_text = latest_user_message(messages)

        # Casual / no-evidence turns: skip corpus dump entirely.
        if (
            context_config
            and project_id
            and not needs_project_context(user_text, messages)
        ):
            detail = {
                "sourceCount": 0,
                "noteCount": 0,
                "tokenCount": 0,
            }
            emit_agent_progress("completed", "retrieving_context", detail, config)
            return {"context": None, "a2ui_pending": None}

        built: Optional[str | dict] = None
        formatted: Optional[str] = None
        if context_config and project_id and user_text:
            result = _run_async(
                build_relevance_context(
                    query=user_text,
                    project_id=str(project_id),
                    context_config=context_config,
                )
            )
            built = {
                "sources": result.get("sources") or [],
                "notes": result.get("notes") or [],
                "total_tokens": result.get("total_tokens") or 0,
            }
            formatted = result.get("formatted")
            detail = {
                "sourceCount": int(result.get("sourceCount") or 0),
                "noteCount": int(result.get("noteCount") or 0),
                "tokenCount": int(result.get("tokenCount") or 0),
                "retrievalModeUsed": result.get("retrievalModeUsed"),
                "fallbackReason": result.get("fallbackReason"),
                "embeddingDimWarning": result.get("embeddingDimWarning"),
            }
            evidence_focus = result.get("evidenceFocus") or []
            emit_evidence_focus(evidence_focus, config)
            emit_agent_progress("completed", "retrieving_context", detail, config)
            return {
                "context": formatted,
                "a2ui_pending": None,
            }
        else:
            built = state.get("context")
            formatted = _format_project_context(built)

        detail = _context_counts(built if isinstance(built, dict) else None, formatted)
        emit_agent_progress("completed", "retrieving_context", detail, config)
        return {"context": formatted, "a2ui_pending": None}
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


def generating(state: ThreadState, config: RunnableConfig) -> dict:
    """Provision model and generate the assistant reply (with optional MCP tools)."""
    try:
        emit_agent_progress("started", "generating", {}, config)
        prompt_data = dict(state)
        if prompt_data.get("project") is not None and "notebook" not in prompt_data:
            prompt_data["notebook"] = prompt_data["project"]
        if prompt_data.get("artifact") and not prompt_data.get("artifact_instructions"):
            default_prompts: DefaultPrompts = _run_async(DefaultPrompts.get_instance())  # type: ignore[assignment]
            if default_prompts.artifact_instructions:
                prompt_data["artifact_instructions"] = (
                    default_prompts.artifact_instructions
                )
        if is_a2ui_chat_enabled():
            prompt_data["a2ui_catalog"] = format_a2ui_agent_catalog()
        system_prompt = Prompter(prompt_template="chat/system").render(data=prompt_data)  # type: ignore[arg-type]
        payload = [SystemMessage(content=system_prompt)] + list(
            state.get("messages", [])
        )
        model_id = config.get("configurable", {}).get("model_id") or state.get(
            "model_override"
        )
        session_id = state.get("session_id") or config.get("configurable", {}).get(
            "thread_id", ""
        )
        assistant_message_id = str(uuid.uuid4())

        project_id = state.get("project_id")
        if not project_id and isinstance(state.get("project"), dict):
            project_id = state["project"].get("id")
        elif not project_id and state.get("project") is not None:
            project_id = getattr(state.get("project"), "id", None)

        user_text = latest_user_message(state.get("messages"))
        is_guest = bool(state.get("is_guest"))
        capability_context: CapabilityRuntimeContext | None = None
        if project_id and session_id and not is_guest:
            capability_context = CapabilityRuntimeContext(
                project_id=str(project_id),
                session_id=str(session_id),
                message_id=assistant_message_id,
                is_guest=False,
                allow_project_artifact_save=requests_project_artifact_save(user_text),
                enable_native_tools=True,
                explicit_skill_ids=list(state.get("skill_ids") or []),
                explicit_collection_ids=list(state.get("collection_ids") or []),
                explicit_mcp_tool_ids=list(state.get("mcp_tool_ids") or []),
                explicit_html_template_id=state.get("html_template_id"),
                explicit_artifact_template_id=state.get("artifact_id"),
                context_config=state.get("context_config"),
                model_override=model_id,
            )

        ai_message = _run_async(
            generate_with_tools(
                provision_model=provision_langchain_model,
                payload=payload,
                model_id=model_id,
                mcp_tool_ids=state.get("mcp_tool_ids"),
                session_id=str(session_id or ""),
                message_id=assistant_message_id,
                config=config,
                strict_mcp_tools=bool(state.get("strict_mcp_tools")),
                capability_context=capability_context,
            )
        )

        content = extract_text_content(ai_message.content)
        cleaned_content = clean_thinking_content(content)
        tools_available = bool(
            (capability_context is not None and capability_context.enable_native_tools)
            or state.get("mcp_tool_ids")
        )
        if not cleaned_content.strip() and tools_available:
            cleaned_content = EMPTY_TOOL_TURN_FALLBACK
        cleaned_message = ai_message.model_copy(
            update={"content": cleaned_content, "id": assistant_message_id}
        )

        # Non-streaming invoke does not emit TEXT_MESSAGE_*; push final text
        # onto the AG-UI wire so the client and queue see the reply.
        emit_assistant_text_message(
            message_id=assistant_message_id,
            message=cleaned_content,
            config=config,
        )

        emit_agent_progress("completed", "generating", {}, config)
        result: dict = {"messages": cleaned_message}
        pending = state.get("a2ui_pending")
        if pending:
            existing = dict(state.get("a2ui_by_message_id") or {})
            existing[assistant_message_id] = pending
            result["a2ui_by_message_id"] = existing
            result["a2ui_pending"] = None
        return result
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


agent_state = StateGraph(ThreadState)
agent_state.add_node("loading_skills", loading_skills)
agent_state.add_node("loading_collections", loading_collections)
agent_state.add_node("retrieving_context", retrieving_context)
agent_state.add_node("generating", generating)
agent_state.add_conditional_edges(
    START,
    route_from_start,
    ["loading_skills", "loading_collections", "retrieving_context"],
)
agent_state.add_conditional_edges(
    "loading_skills",
    route_after_skills,
    ["loading_collections", "retrieving_context"],
)
agent_state.add_edge("loading_collections", "retrieving_context")
agent_state.add_edge("retrieving_context", "generating")
agent_state.add_edge("generating", END)

# Import-time fallback for tests; API lifespan rebinds AsyncSqliteSaver.
graph = agent_state.compile(checkpointer=MemorySaver())


def compile_graph(checkpointer: BaseCheckpointSaver):
    """Compile an isolated project-chat graph with the supplied checkpointer."""
    return agent_state.compile(checkpointer=checkpointer)


def bind_checkpointer(checkpointer: BaseCheckpointSaver) -> None:
    """Recompile the chat graph with the process-wide async checkpointer."""
    global graph
    graph = compile_graph(checkpointer)

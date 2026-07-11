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
from construction_os.domain.project import Project
from construction_os.exceptions import ConstructionOSError
from construction_os.graphs.progress import emit_agent_progress
from construction_os.mcp.chat_loop import generate_with_mcp_tools
from construction_os.skills.loader import format_skills_context, load_one_skill_md
from construction_os.utils import clean_thinking_content
from construction_os.utils.context_builder import ContextBuilder, ContextConfig
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
    mcp_tool_ids: Optional[list]
    session_id: Optional[str]


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
        insights = context.get("insights") or []
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
        if isinstance(insights, list) and insights:
            parts.append("## Insights")
            for item in insights:
                parts.append(str(item))
            parts.append("")
        if parts:
            return "\n".join(parts).strip()
        return "\n".join(f"**{k}:** {v}" for k, v in context.items())
    return str(context)


def _context_counts(context: Optional[str | dict], formatted: Optional[str]) -> dict:
    """Derive source/note/insight/token counts for progress events."""
    source_count = 0
    note_count = 0
    insight_count = 0
    if isinstance(context, dict):
        sources = context.get("sources") or []
        notes = context.get("notes") or []
        insights = context.get("insights") or []
        source_count = len(sources) if isinstance(sources, list) else 0
        note_count = len(notes) if isinstance(notes, list) else 0
        insight_count = len(insights) if isinstance(insights, list) else 0
        if context.get("total_tokens") is not None:
            return {
                "sourceCount": source_count,
                "noteCount": note_count,
                "insightCount": insight_count,
                "tokenCount": int(context["total_tokens"]),
            }
    text = formatted or ""
    return {
        "sourceCount": source_count,
        "noteCount": note_count,
        "insightCount": insight_count,
        "tokenCount": token_count(text) if text else 0,
    }


def route_from_start(state: ThreadState) -> Literal["loading_skills", "retrieving_context"]:
    if state.get("skill_ids"):
        return "loading_skills"
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


def retrieving_context(state: ThreadState, config: RunnableConfig) -> dict:
    """Retrieve/format Project context with count/token progress events."""
    try:
        emit_agent_progress("started", "retrieving_context", {}, config)

        context_config = state.get("context_config")
        project_id = state.get("project_id")
        if not project_id and isinstance(state.get("project"), dict):
            project_id = state["project"].get("id")  # type: ignore[index]
        elif not project_id and state.get("project") is not None:
            project_id = getattr(state.get("project"), "id", None)

        built: Optional[str | dict] = None
        if context_config and project_id:
            config_obj = ContextConfig(
                sources=(context_config.get("sources") or {}),
                notes=(context_config.get("notes") or {}),
            )
            built = _run_async(
                ContextBuilder(
                    project_id=project_id,
                    context_config=config_obj,
                    include_notes=True,
                    include_insights=True,
                ).build()
            )
            formatted = _format_project_context(built)
        else:
            built = state.get("context")
            formatted = _format_project_context(built)

        detail = _context_counts(built if isinstance(built, dict) else None, formatted)
        emit_agent_progress("completed", "retrieving_context", detail, config)
        return {"context": formatted}
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
        system_prompt = Prompter(prompt_template="chat/system").render(
            data=prompt_data
        )  # type: ignore[arg-type]
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

        ai_message = _run_async(
            generate_with_mcp_tools(
                provision_model=provision_langchain_model,
                payload=payload,
                model_id=model_id,
                mcp_tool_ids=state.get("mcp_tool_ids"),
                session_id=str(session_id or ""),
                message_id=assistant_message_id,
                config=config,
            )
        )

        content = extract_text_content(ai_message.content)
        cleaned_content = clean_thinking_content(content)
        cleaned_message = ai_message.model_copy(
            update={"content": cleaned_content, "id": assistant_message_id}
        )

        emit_agent_progress("completed", "generating", {}, config)
        return {"messages": cleaned_message}
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


agent_state = StateGraph(ThreadState)
agent_state.add_node("loading_skills", loading_skills)
agent_state.add_node("retrieving_context", retrieving_context)
agent_state.add_node("generating", generating)
agent_state.add_conditional_edges(
    START,
    route_from_start,
    ["loading_skills", "retrieving_context"],
)
agent_state.add_edge("loading_skills", "retrieving_context")
agent_state.add_edge("retrieving_context", "generating")
agent_state.add_edge("generating", END)

# Import-time fallback for tests; API lifespan rebinds AsyncSqliteSaver.
graph = agent_state.compile(checkpointer=MemorySaver())


def bind_checkpointer(checkpointer: BaseCheckpointSaver) -> None:
    """Recompile the chat graph with the process-wide async checkpointer."""
    global graph
    graph = agent_state.compile(checkpointer=checkpointer)

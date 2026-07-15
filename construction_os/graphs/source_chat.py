import asyncio
import concurrent.futures
import uuid
from typing import Annotated, Dict, List, Literal, Optional

from ai_prompter import Prompter
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from construction_os.ai.provision import provision_langchain_model
from construction_os.domain.project import Source, SourceInsight
from construction_os.exceptions import ConstructionOSError
from construction_os.graphs.progress import emit_agent_progress
from construction_os.mcp.chat_loop import generate_with_mcp_tools
from construction_os.skills.loader import format_skills_context, load_one_skill_md
from construction_os.utils import clean_thinking_content
from construction_os.utils.context_builder import ContextBuilder
from construction_os.utils.error_classifier import classify_error
from construction_os.utils.text_utils import extract_text_content
from construction_os.utils.token_utils import token_count


class SourceChatState(TypedDict):
    messages: Annotated[list, add_messages]
    source_id: str
    source: Optional[Source]
    insights: Optional[List[SourceInsight]]
    context: Optional[str]
    model_override: Optional[str]
    context_indicators: Optional[Dict[str, List[str]]]
    skills_context: Optional[str]
    skill_ids: Optional[list]
    mcp_tool_ids: Optional[list]
    strict_mcp_tools: bool
    session_id: Optional[str]
    html_template_id: Optional[str]
    html_template: Optional[dict]


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


def _format_source_context(context_data: Dict) -> str:
    """Format ContextBuilder output into prompt text."""
    context_parts = []

    if context_data.get("sources"):
        context_parts.append("## SOURCE CONTENT")
        for source in context_data["sources"]:
            if isinstance(source, dict):
                context_parts.append(f"**Source ID:** {source.get('id', 'Unknown')}")
                context_parts.append(f"**Title:** {source.get('title', 'No title')}")
                if source.get("full_text"):
                    full_text = source["full_text"]
                    if len(full_text) > 5000:
                        full_text = full_text[:5000] + "...\n[Content truncated]"
                    context_parts.append(f"**Content:**\n{full_text}")
                context_parts.append("")

    if context_data.get("insights"):
        context_parts.append("## SOURCE INSIGHTS")
        for insight in context_data["insights"]:
            if isinstance(insight, dict):
                context_parts.append(f"**Insight ID:** {insight.get('id', 'Unknown')}")
                context_parts.append(
                    f"**Type:** {insight.get('insight_type', 'Unknown')}"
                )
                context_parts.append(
                    f"**Content:** {insight.get('content', 'No content')}"
                )
                context_parts.append("")

    if context_data.get("metadata"):
        metadata = context_data["metadata"]
        context_parts.append("## CONTEXT METADATA")
        context_parts.append(f"- Source count: {metadata.get('source_count', 0)}")
        context_parts.append(f"- Insight count: {metadata.get('insight_count', 0)}")
        context_parts.append(f"- Total tokens: {context_data.get('total_tokens', 0)}")
        context_parts.append("")

    return "\n".join(context_parts)


def route_from_start(
    state: SourceChatState,
) -> Literal["loading_skills", "retrieving_context"]:
    if state.get("skill_ids"):
        return "loading_skills"
    return "retrieving_context"


def loading_skills(state: SourceChatState, config: RunnableConfig) -> dict:
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


def retrieving_context(state: SourceChatState, config: RunnableConfig) -> dict:
    """Build source + insights context with count/token progress events."""
    try:
        emit_agent_progress("started", "retrieving_context", {}, config)
        source_id = state.get("source_id")
        if not source_id:
            raise ValueError("source_id is required in state")

        context_data = _run_async(
            ContextBuilder(
                source_id=source_id,
                include_insights=True,
                include_notes=False,
                max_tokens=50000,
            ).build()
        )

        source = None
        insights = []
        context_indicators: dict[str, list[str]] = {
            "sources": [],
            "insights": [],
            "notes": [],
        }

        if context_data.get("sources"):
            source_info = context_data["sources"][0]
            source = (
                Source(**source_info) if isinstance(source_info, dict) else source_info
            )
            context_indicators["sources"].append(source.id)

        if context_data.get("insights"):
            for insight_data in context_data["insights"]:
                insight = (
                    SourceInsight(**insight_data)
                    if isinstance(insight_data, dict)
                    else insight_data
                )
                insights.append(insight)
                context_indicators["insights"].append(insight.id)

        formatted_context = _format_source_context(context_data)
        token_estimate = int(
            context_data.get("total_tokens")
            or (token_count(formatted_context) if formatted_context else 0)
        )
        emit_agent_progress(
            "completed",
            "retrieving_context",
            {
                "sourceCount": len(context_indicators["sources"]),
                "noteCount": 0,
                "insightCount": len(context_indicators["insights"]),
                "tokenCount": token_estimate,
            },
            config,
        )
        return {
            "source": source,
            "insights": insights,
            "context": formatted_context,
            "context_indicators": context_indicators,
        }
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


def generating(state: SourceChatState, config: RunnableConfig) -> dict:
    """Provision model and generate reply."""
    try:
        emit_agent_progress("started", "generating", {}, config)
        source = state.get("source")
        insights = state.get("insights") or []
        prompt_data = {
            "source": source.model_dump() if source else None,
            "insights": [insight.model_dump() for insight in insights]
            if insights
            else [],
            "context": state.get("context"),
            "context_indicators": state.get("context_indicators"),
            "skills_context": state.get("skills_context"),
            "html_template": state.get("html_template"),
        }
        system_prompt = Prompter(prompt_template="source_chat/system").render(
            data=prompt_data
        )
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
                strict_mcp_tools=bool(state.get("strict_mcp_tools")),
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


source_chat_state = StateGraph(SourceChatState)
source_chat_state.add_node("loading_skills", loading_skills)
source_chat_state.add_node("retrieving_context", retrieving_context)
source_chat_state.add_node("generating", generating)
source_chat_state.add_conditional_edges(
    START,
    route_from_start,
    ["loading_skills", "retrieving_context"],
)
source_chat_state.add_edge("loading_skills", "retrieving_context")
source_chat_state.add_edge("retrieving_context", "generating")
source_chat_state.add_edge("generating", END)

source_chat_graph = source_chat_state.compile(checkpointer=MemorySaver())


def compile_graph(checkpointer: BaseCheckpointSaver):
    """Compile an isolated source-chat graph with the supplied checkpointer."""
    return source_chat_state.compile(checkpointer=checkpointer)


def bind_checkpointer(checkpointer: BaseCheckpointSaver) -> None:
    """Recompile the source chat graph with the process-wide async checkpointer."""
    global source_chat_graph
    source_chat_graph = compile_graph(checkpointer)

import asyncio
import traceback
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from loguru import logger
from pydantic import BaseModel, Field

from api import ag_ui_agents
from api.chat_queue_service import (
    ChatQueueConflictError,
    ChatQueueNotFoundError,
    chat_queue_service,
)
from construction_os.ai.provision import provision_langchain_model
from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.artifact import Artifact
from construction_os.domain.html_document import HtmlTemplate
from construction_os.domain.project import ChatSession, Project, Source
from construction_os.exceptions import (
    NotFoundError,
)
from construction_os.graphs import chat as chat_graph_module
from construction_os.utils.graph_utils import (
    get_session_message_count,
    truncate_messages_from_id,
)
from construction_os.utils.html_media import expand_image_tokens
from construction_os.utils.text_utils import (
    clean_thinking_content,
    extract_text_content,
)

router = APIRouter()

GUEST_KEY_HEADER = "X-Guest-Key"


def _normalize_guest_key(value: Optional[str]) -> Optional[str]:
    """Treat missing/blank guest keys as owner (None)."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _session_guest_key(session: ChatSession) -> Optional[str]:
    return _normalize_guest_key(getattr(session, "guest_key", None))


def _assert_session_guest_access(
    session: ChatSession, request_guest_key: Optional[str]
) -> None:
    """Owners see untagged sessions; guests only their own guest_key sessions."""
    session_key = _session_guest_key(session)
    request_key = _normalize_guest_key(request_guest_key)
    if session_key != request_key:
        raise HTTPException(status_code=403, detail="Session access denied")


def _session_response(
    session: ChatSession,
    *,
    project_id: Optional[str],
    message_count: Optional[int] = None,
) -> "ChatSessionResponse":
    return ChatSessionResponse(
        id=session.id or "",
        title=session.title or "Untitled Session",
        project_id=project_id,
        created=str(session.created),
        updated=str(session.updated),
        message_count=message_count,
        model_override=getattr(session, "model_override", None),
        skill_ids=getattr(session, "skill_ids", None) or [],
        html_template_id=getattr(session, "html_template_id", None),
        guest_key=_session_guest_key(session),
    )


# Request/Response models
class CreateSessionRequest(BaseModel):
    project_id: str = Field(..., description="Project ID to create session for")
    title: Optional[str] = Field(None, description="Optional session title")
    model_override: Optional[str] = Field(
        None, description="Optional model override for this session"
    )
    skill_ids: Optional[List[str]] = Field(
        None, description="Skill IDs selected for this session"
    )
    html_template_id: Optional[str] = Field(
        None, description="Optional HTML bid template for structured output"
    )
    guest_key: Optional[str] = Field(
        None,
        description="Optional guest key for shared-chat private sessions",
    )


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = Field(None, description="New session title")
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )
    skill_ids: Optional[List[str]] = Field(
        None, description="Skill IDs selected for this session"
    )
    html_template_id: Optional[str] = Field(
        None, description="Optional HTML bid template for structured output"
    )


class ChatMessage(BaseModel):
    id: str = Field(..., description="Message ID")
    type: str = Field(..., description="Message type (human|ai)")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp")
    a2ui_payload: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Optional A2UI v0.9 message array attached to this AI message",
    )


class ChatSessionResponse(BaseModel):
    id: str = Field(..., description="Session ID")
    title: str = Field(..., description="Session title")
    project_id: Optional[str] = Field(None, description="Project ID")
    created: str = Field(..., description="Creation timestamp")
    updated: str = Field(..., description="Last update timestamp")
    message_count: Optional[int] = Field(
        None, description="Number of messages in session"
    )
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )
    skill_ids: Optional[List[str]] = Field(
        None, description="Skill IDs selected for this session"
    )
    html_template_id: Optional[str] = Field(
        None, description="Optional HTML bid template for structured output"
    )
    guest_key: Optional[str] = Field(
        None, description="Guest key when this is a shared-chat session"
    )


class ChatSessionWithMessagesResponse(ChatSessionResponse):
    messages: List[ChatMessage] = Field(
        default_factory=list, description="Session messages"
    )


class ExecuteChatRequest(BaseModel):
    session_id: str = Field(..., description="Chat session ID")
    message: str = Field(..., description="User message content")
    context: Optional[Dict[str, Any]] = Field(
        None,
        description="Prebuilt chat context (legacy); prefer context_config for streamed retrieval",
    )
    context_config: Optional[Dict[str, Any]] = Field(
        None,
        description="Source/note inclusion config; built inside the graph as retrieving_context",
    )
    model_override: Optional[str] = Field(
        None, description="Optional model override for this message"
    )
    skill_ids: Optional[List[str]] = Field(
        None,
        description="Selected skill IDs; when omitted, session-stored skills are used",
    )
    html_template_id: Optional[str] = Field(
        None,
        description="HTML template id for structured output; when omitted, session value is used",
    )
    mcp_tool_ids: Optional[List[str]] = Field(
        None,
        description="Selected MCP tool IDs for this message only (transient allowlist request)",
    )
    edit_message_id: Optional[str] = Field(
        None,
        description="When set, truncate the session from this human message and resend",
    )
    artifact_id: Optional[str] = Field(
        None,
        description="Optional artifact template ID; injects artifact instructions into the chat system prompt",
    )


class ExecuteChatResponse(BaseModel):
    session_id: str = Field(..., description="Session ID")
    messages: List[ChatMessage] = Field(..., description="Updated message list")


class BuildContextRequest(BaseModel):
    project_id: str = Field(..., description="Project ID")
    context_config: Dict[str, Any] = Field(..., description="Context configuration")


class BuildContextResponse(BaseModel):
    context: Dict[str, Any] = Field(..., description="Built context data")
    token_count: int = Field(..., description="Estimated token count")
    char_count: int = Field(..., description="Character count")


class SuccessResponse(BaseModel):
    success: bool = Field(True, description="Operation success status")
    message: str = Field(..., description="Success message")


class ChatSuggestionsRequest(BaseModel):
    scope: Literal["project", "source"] = Field(
        ..., description="Whether suggestions are for project or source chat"
    )
    project_id: Optional[str] = Field(
        None, description="Project ID (required for project scope)"
    )
    source_id: Optional[str] = Field(
        None, description="Source ID (required for source scope)"
    )
    count: int = Field(
        4, ge=3, le=5, description="Number of suggestions to generate (3–5)"
    )


class ChatSuggestionsResponse(BaseModel):
    suggestions: List[str] = Field(
        default_factory=list, description="Suggested user messages"
    )


def _parse_suggestions_json(raw: str, count: int) -> List[str]:
    """Extract a JSON string array from model output; soft-fail to []."""
    import json
    import re

    text = (raw or "").strip()
    if not text:
        return []

    # Prefer fenced JSON, then first [...] block
    fenced = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
    candidate = fenced.group(1) if fenced else None
    if not candidate:
        bracket = re.search(r"\[[\s\S]*\]", text)
        candidate = bracket.group(0) if bracket else text

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        logger.warning("Chat suggestions: failed to parse model JSON")
        return []

    if not isinstance(parsed, list):
        return []

    cleaned: List[str] = []
    for item in parsed:
        if isinstance(item, str):
            s = item.strip()
            if s:
                cleaned.append(s)
        if len(cleaned) >= count:
            break
    return cleaned[:count]


async def _build_suggestion_context(
    *,
    scope: Literal["project", "source"],
    project_id: Optional[str],
    source_id: Optional[str],
) -> str:
    """Cheap titles/topics/description context — never full_text."""
    lines: List[str] = []

    if scope == "project":
        if not project_id:
            raise HTTPException(status_code=400, detail="project_id is required")
        project = await Project.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        lines.append(f"Project name: {project.name}")
        if getattr(project, "description", None):
            lines.append(f"Project description: {project.description}")

        sources = await project.get_sources(include_full_text=False)
        for source in sources[:12]:
            title = source.title or "Untitled source"
            topics = [t for t in (source.topics or []) if t][:6]
            topic_bit = f" (topics: {', '.join(topics)})" if topics else ""
            lines.append(f"- Source: {title}{topic_bit}")

        notes = await project.get_notes(include_content=False)
        for note in notes[:12]:
            lines.append(f"- Note: {note.title or 'Untitled note'}")

    else:
        if not source_id:
            raise HTTPException(status_code=400, detail="source_id is required")
        source = await Source.get(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        title = source.title or "Untitled source"
        topics = [t for t in (source.topics or []) if t][:8]
        lines.append(f"Source title: {title}")
        if topics:
            lines.append(f"Topics: {', '.join(topics)}")

        try:
            insights = await source.get_insights()
            types = sorted(
                {
                    str(getattr(i, "insight_type", "") or "").strip()
                    for i in (insights or [])
                    if getattr(i, "insight_type", None)
                }
            )
            if types:
                lines.append(f"Insight types: {', '.join(types[:8])}")
        except Exception as e:
            logger.debug(f"Skipping insights for suggestion context: {e}")

        if project_id:
            project = await Project.get(project_id)
            if project:
                lines.append(f"Related project: {project.name}")

    return "\n".join(lines) if lines else "No project content titles available yet."


@router.get("/chat/sessions", response_model=List[ChatSessionResponse])
async def get_sessions(
    project_id: str = Query(..., description="Project ID"),
    x_guest_key: Optional[str] = Header(None, alias=GUEST_KEY_HEADER),
):
    """Get chat sessions for a Project, scoped by optional guest key."""
    try:
        guest_key = _normalize_guest_key(x_guest_key)
        project = await Project.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        sessions_list = await project.get_chat_sessions()
        if guest_key:
            sessions_list = [
                s for s in sessions_list if _session_guest_key(s) == guest_key
            ]
        else:
            sessions_list = [
                s for s in sessions_list if _session_guest_key(s) is None
            ]

        results = []
        for session in sessions_list:
            session_id = str(session.id)
            msg_count = await get_session_message_count(
                chat_graph_module.graph, session_id
            )
            results.append(
                _session_response(
                    session,
                    project_id=project_id,
                    message_count=msg_count,
                )
            )

        return results
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        logger.error(f"Error fetching chat sessions: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching chat sessions: {str(e)}"
        )


@router.post("/chat/sessions", response_model=ChatSessionResponse)
async def create_session(
    request: CreateSessionRequest,
    x_guest_key: Optional[str] = Header(None, alias=GUEST_KEY_HEADER),
):
    """Create a new chat session."""
    try:
        guest_key = _normalize_guest_key(x_guest_key) or _normalize_guest_key(
            request.guest_key
        )
        project = await Project.get(request.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        skill_ids: List[str] = [] if guest_key else list(request.skill_ids or [])
        html_template_id = None if guest_key else request.html_template_id

        session = ChatSession(
            title=request.title
            or f"Chat Session {asyncio.get_event_loop().time():.0f}",
            model_override=None if guest_key else request.model_override,
            skill_ids=skill_ids,
            html_template_id=html_template_id,
            guest_key=guest_key,
        )
        await session.save()
        await session.relate_to_project(request.project_id)

        return _session_response(session, project_id=request.project_id, message_count=0)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        logger.error(f"Error creating chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating chat session: {str(e)}"
        )


@router.get(
    "/chat/sessions/{session_id}", response_model=ChatSessionWithMessagesResponse
)
async def get_session(
    session_id: str,
    x_guest_key: Optional[str] = Header(None, alias=GUEST_KEY_HEADER),
):
    """Get a specific session with its messages."""
    try:
        guest_key = _normalize_guest_key(x_guest_key)
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        _assert_session_guest_access(session, guest_key)

        thread_state = await chat_graph_module.graph.aget_state(
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )

        messages: list[ChatMessage] = []
        a2ui_by_message_id: dict = {}
        if thread_state and thread_state.values:
            raw_a2ui = thread_state.values.get("a2ui_by_message_id") or {}
            if isinstance(raw_a2ui, dict):
                a2ui_by_message_id = raw_a2ui
            if "messages" in thread_state.values:
                for msg in thread_state.values["messages"]:
                    msg_id = getattr(msg, "id", f"msg_{len(messages)}")
                    payload = a2ui_by_message_id.get(str(msg_id))
                    messages.append(
                        ChatMessage(
                            id=msg_id,
                            type=msg.type if hasattr(msg, "type") else "unknown",
                            content=msg.content if hasattr(msg, "content") else str(msg),
                            timestamp=None,
                            a2ui_payload=payload if isinstance(payload, list) else None,
                        )
                    )

        project_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )

        project_id = project_query[0]["out"] if project_query else None

        if not project_id:
            logger.warning(
                f"No Project relationship found for session {session_id} - may be an orphaned session"
            )

        base = _session_response(
            session, project_id=project_id, message_count=len(messages)
        )
        return ChatSessionWithMessagesResponse(
            **base.model_dump(),
            messages=messages,
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error fetching session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching session: {str(e)}")


@router.put("/chat/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    x_guest_key: Optional[str] = Header(None, alias=GUEST_KEY_HEADER),
):
    """Update session title."""
    try:
        guest_key = _normalize_guest_key(x_guest_key)
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        _assert_session_guest_access(session, guest_key)

        update_data = request.model_dump(exclude_unset=True)

        if "title" in update_data:
            session.title = update_data["title"]

        if not guest_key:
            if "model_override" in update_data:
                session.model_override = update_data["model_override"]

            if "skill_ids" in update_data:
                session.skill_ids = update_data["skill_ids"] or []

            if "html_template_id" in update_data:
                session.html_template_id = update_data["html_template_id"] or None

        await session.save()

        project_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )
        project_id = project_query[0]["out"] if project_query else None

        msg_count = await get_session_message_count(
            chat_graph_module.graph, full_session_id
        )

        return _session_response(
            session, project_id=project_id, message_count=msg_count
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error updating session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating session: {str(e)}")


@router.delete("/chat/sessions/{session_id}", response_model=SuccessResponse)
async def delete_session(
    session_id: str,
    x_guest_key: Optional[str] = Header(None, alias=GUEST_KEY_HEADER),
):
    """Delete a chat session."""
    try:
        guest_key = _normalize_guest_key(x_guest_key)
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        _assert_session_guest_access(session, guest_key)

        try:
            await chat_queue_service.delete_session(full_session_id)
        except ChatQueueConflictError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        except ChatQueueNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

        return SuccessResponse(success=True, message="Session deleted successfully")
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")


@router.post("/chat/execute")
async def execute_chat(
    request: ExecuteChatRequest,
    x_guest_key: Optional[str] = Header(None, alias=GUEST_KEY_HEADER),
):
    """Execute a chat request and stream AG-UI events."""
    try:
        guest_key = _normalize_guest_key(x_guest_key)
        full_session_id = (
            request.session_id
            if request.session_id.startswith("chat_session:")
            else f"chat_session:{request.session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        _assert_session_guest_access(session, guest_key)

        project_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )
        project = None
        project_id = None
        project_meta = None
        if project_query:
            project = await Project.get(project_query[0]["out"])
            if project:
                project_id = getattr(project, "id", None)
                project_meta = {
                    "id": project_id,
                    "name": getattr(project, "name", None),
                    "description": getattr(project, "description", None),
                }

        if guest_key:
            model_override = None
            skill_ids: List[str] = []
            session.skill_ids = []
            html_template_id = None
            session.html_template_id = None
            html_template_meta = None
            mcp_tool_ids: List[str] = []
            artifact_id = None
            artifact_meta = None
        else:
            model_override = (
                request.model_override
                if request.model_override is not None
                else getattr(session, "model_override", None)
            )

            if request.skill_ids is not None:
                skill_ids = list(request.skill_ids)
                session.skill_ids = skill_ids
            else:
                skill_ids = list(getattr(session, "skill_ids", None) or [])

            if request.html_template_id is not None:
                html_template_id = request.html_template_id or None
                session.html_template_id = html_template_id
            else:
                html_template_id = getattr(session, "html_template_id", None)

            html_template_meta = None
            if html_template_id:
                try:
                    tmpl = await HtmlTemplate.get(html_template_id)
                    # Expand {{image:slug}} so the model sees concrete library img tags
                    # and is less likely to invent relative logo paths.
                    html_body = await expand_image_tokens(tmpl.html_body)
                    html_template_meta = {
                        "id": tmpl.id,
                        "name": tmpl.name,
                        "category": tmpl.category,
                        "html_body": html_body,
                    }
                except NotFoundError:
                    html_template_id = None
                    session.html_template_id = None
                    html_template_meta = None

            mcp_tool_ids = list(request.mcp_tool_ids or [])
            artifact_id = request.artifact_id
            artifact_meta = None
            if artifact_id:
                artifact = await Artifact.get(artifact_id)
                if artifact:
                    artifact_meta = {
                        "id": artifact.id,
                        "name": artifact.name,
                        "title": artifact.title,
                        "description": artifact.description,
                        "prompt": artifact.prompt,
                    }
                else:
                    artifact_id = None

        if request.edit_message_id:
            try:
                await truncate_messages_from_id(
                    chat_graph_module.graph,
                    full_session_id,
                    request.edit_message_id,
                )
            except NotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e

        await session.save()

        run_input = ag_ui_agents.build_run_input(
            thread_id=full_session_id,
            message=request.message,
            message_id=request.edit_message_id,
            forwarded_props={
                "context": request.context,
                "context_config": request.context_config,
                "project_id": project_id,
                "project": project_meta,
                "model_override": model_override,
                "skill_ids": skill_ids,
                "mcp_tool_ids": mcp_tool_ids,
                "session_id": full_session_id,
                "artifact_id": artifact_id if artifact_meta else None,
                "artifact": artifact_meta,
                "html_template_id": html_template_id if html_template_meta else None,
                "html_template": html_template_meta,
            },
        )

        return ag_ui_agents.ag_ui_streaming_response(
            ag_ui_agents.project_chat_agent,
            run_input,
            configurable={"model_id": model_override},
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(
            f"Error executing chat: {str(e)}\n"
            f"  Session ID: {request.session_id}\n"
            f"  Model override: {request.model_override}\n"
            f"  Traceback:\n{traceback.format_exc()}"
        )
        raise HTTPException(status_code=500, detail=f"Error executing chat: {str(e)}")


@router.post("/chat/context", response_model=BuildContextResponse)
async def build_context(request: BuildContextRequest):
    """Estimate chat context for the footer preview.

    UI selections are a search pool. Actual chat messages retrieve top-K
    evidence (capped), so this endpoint returns a retrieval-sized estimate
    instead of dumping every insight/full text.
    """
    try:
        from construction_os.graphs.chat_context import (
            CHAT_CONTEXT_MAX_TOKENS,
            eligible_note_ids,
            eligible_source_ids,
            estimate_preview_tokens,
        )

        project = await Project.get(request.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        context_config = request.context_config or {}
        source_pool = eligible_source_ids(context_config)
        note_pool = eligible_note_ids(context_config)

        context_data: dict[str, list[dict[str, str]]] = {
            "sources": [{"id": sid} for sid in sorted(source_pool)],
            "notes": [{"id": nid} for nid in sorted(note_pool)],
        }

        estimated_tokens = estimate_preview_tokens(
            source_pool_size=len(source_pool),
            note_pool_size=len(note_pool),
            max_tokens=CHAT_CONTEXT_MAX_TOKENS,
        )
        char_count = estimated_tokens * 4

        return BuildContextResponse(
            context=context_data,
            token_count=estimated_tokens,
            char_count=char_count,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building context: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error building context: {str(e)}")


@router.post("/chat/suggestions", response_model=ChatSuggestionsResponse)
async def get_chat_suggestions(request: ChatSuggestionsRequest):
    """Generate short LLM starter prompts grounded in project/source titles."""
    try:
        context_text = await _build_suggestion_context(
            scope=request.scope,
            project_id=request.project_id,
            source_id=request.source_id,
        )

        count = request.count
        scope_label = "project knowledge base" if request.scope == "project" else "source"
        system_prompt = (
            f"You help users start a chat about a construction research {scope_label}. "
            f"Using ONLY the titles/topics/metadata below (never invent documents), "
            f"propose {count} short, actionable example user messages they could send. "
            "Requirements:\n"
            f"- Return ONLY a JSON array of {count} strings (no prose, no markdown).\n"
            "- Each string is a complete user message, under 120 characters.\n"
            "- Diversify intents: summarize, compare, find risks/issues, explain a topic, next steps.\n"
            "- Ground wording in the listed titles/topics when possible.\n"
            "- If little content exists, still return useful generic research questions for this chat."
        )
        payload = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=context_text),
        ]
        # Use default chat model (cheap short call) — not artifact/prompt_graph defaults
        model = await provision_langchain_model(
            str(payload),
            None,
            "chat",
            max_tokens=800,
        )
        response = await model.ainvoke(payload)
        raw_output = clean_thinking_content(extract_text_content(response.content))
        suggestions = _parse_suggestions_json(raw_output, count)
        return ChatSuggestionsResponse(suggestions=suggestions)
    except HTTPException:
        raise
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Error generating chat suggestions: {str(e)}")
        # Soft degrade — empty list keeps the chat usable
        return ChatSuggestionsResponse(suggestions=[])

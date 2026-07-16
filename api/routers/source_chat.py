import asyncio
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Path
from langchain_core.runnables import RunnableConfig
from loguru import logger
from pydantic import BaseModel, Field

from api import ag_ui_agents
from api.chat_queue_service import (
    ChatQueueConflictError,
    ChatQueueNotFoundError,
    chat_queue_service,
)
from construction_os.domain.project import ChatSession, Source
from construction_os.exceptions import NotFoundError
from construction_os.graphs import source_chat as source_chat_module
from construction_os.utils.chat_session import (
    hydrate_langgraph_messages,
    list_chat_sessions_for_out,
    normalize_chat_session_id,
    normalize_source_id,
    resolve_html_template_meta,
    resolve_session_collection_ids,
    resolve_session_html_template_id,
    resolve_session_skill_ids,
    session_record_fields,
    session_refers_to,
)
from construction_os.utils.graph_utils import get_session_message_count

router = APIRouter()


async def _assert_source_session_relation(
    session_id: str,
    source_id: str,
) -> None:
    """Raise 404 when the session is not linked to the source."""
    if not await session_refers_to(session_id, source_id):
        raise HTTPException(
            status_code=404, detail="Session not found for this source"
        )


# Request/Response models
class CreateSourceChatSessionRequest(BaseModel):
    source_id: str = Field(..., description="Source ID to create chat session for")
    title: Optional[str] = Field(None, description="Optional session title")
    model_override: Optional[str] = Field(
        None, description="Optional model override for this session"
    )
    skill_ids: Optional[List[str]] = Field(
        None, description="Skill IDs selected for this session"
    )
    collection_ids: Optional[List[str]] = Field(
        None, description="Collection IDs selected for this session"
    )
    html_template_id: Optional[str] = Field(
        None, description="Optional HTML bid template for structured output"
    )

class UpdateSourceChatSessionRequest(BaseModel):
    title: Optional[str] = Field(None, description="New session title")
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )
    skill_ids: Optional[List[str]] = Field(
        None, description="Skill IDs selected for this session"
    )
    collection_ids: Optional[List[str]] = Field(
        None, description="Collection IDs selected for this session"
    )
    html_template_id: Optional[str] = Field(
        None, description="Optional HTML bid template for structured output"
    )

class ChatMessage(BaseModel):
    id: str = Field(..., description="Message ID")
    type: str = Field(..., description="Message type (human|ai)")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp")


class ContextIndicator(BaseModel):
    sources: List[str] = Field(
        default_factory=list, description="Source IDs used in context"
    )
    notes: List[str] = Field(
        default_factory=list, description="Note IDs used in context"
    )

class SourceChatSessionResponse(BaseModel):
    id: str = Field(..., description="Session ID")
    title: str = Field(..., description="Session title")
    source_id: str = Field(..., description="Source ID")
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )
    skill_ids: Optional[List[str]] = Field(
        None, description="Skill IDs selected for this session"
    )
    collection_ids: Optional[List[str]] = Field(
        None, description="Collection IDs selected for this session"
    )
    html_template_id: Optional[str] = Field(
        None, description="Optional HTML bid template for structured output"
    )
    created: str = Field(..., description="Creation timestamp")
    updated: str = Field(..., description="Last update timestamp")
    message_count: Optional[int] = Field(
        None, description="Number of messages in session"
    )

class SourceChatSessionWithMessagesResponse(SourceChatSessionResponse):
    messages: List[ChatMessage] = Field(
        default_factory=list, description="Session messages"
    )
    context_indicators: Optional[ContextIndicator] = Field(
        None, description="Context indicators from last response"
    )

class SendMessageRequest(BaseModel):
    message: str = Field(..., description="User message content")
    model_override: Optional[str] = Field(
        None, description="Optional model override for this message"
    )
    skill_ids: Optional[List[str]] = Field(
        None,
        description="Selected skill IDs; when omitted, session-stored skills are used",
    )
    collection_ids: Optional[List[str]] = Field(
        None,
        description="Selected collection IDs; when omitted, session-stored collections are used",
    )
    html_template_id: Optional[str] = Field(
        None,
        description="HTML template id for structured output; when omitted, session value is used",
    )
    mcp_tool_ids: Optional[List[str]] = Field(
        None,
        description="Selected MCP tool IDs for this message only",
    )

class SuccessResponse(BaseModel):
    success: bool = Field(True, description="Operation success status")
    message: str = Field(..., description="Success message")


def _source_session_response(
    session: ChatSession,
    *,
    source_id: str,
    message_count: Optional[int] = None,
) -> SourceChatSessionResponse:
    return SourceChatSessionResponse(
        **session_record_fields(session),
        source_id=source_id,
        message_count=message_count,
    )


@router.post(
    "/sources/{source_id}/chat/sessions", response_model=SourceChatSessionResponse
)
async def create_source_chat_session(
    request: CreateSourceChatSessionRequest,
    source_id: str = Path(..., description="Source ID"),
):
    """Create a new chat session for a source."""
    try:
        # Verify source exists
        full_source_id = normalize_source_id(source_id)
        source = await Source.get(full_source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Create new session with model_override support
        session = ChatSession(
            title=request.title or f"Source Chat {asyncio.get_event_loop().time():.0f}",
            model_override=request.model_override,
            skill_ids=request.skill_ids or [],
            collection_ids=request.collection_ids or [],
            html_template_id=request.html_template_id,
        )
        await session.save()

        # Relate session to source using "refers_to" relation
        await session.relate("refers_to", full_source_id)

        return _source_session_response(
            session,
            source_id=source_id,
            message_count=0,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Source not found")
    except Exception as e:
        logger.error(f"Error creating source chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating source chat session: {str(e)}"
        )


@router.get(
    "/sources/{source_id}/chat/sessions", response_model=List[SourceChatSessionResponse]
)
async def get_source_chat_sessions(source_id: str = Path(..., description="Source ID")):
    """Get all chat sessions for a source."""
    try:
        # Verify source exists
        full_source_id = normalize_source_id(source_id)
        source = await Source.get(full_source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        sessions = await list_chat_sessions_for_out(full_source_id)

        results: List[SourceChatSessionResponse] = []
        for session in sessions:
            session_id = str(session.id)
            msg_count = await get_session_message_count(
                source_chat_module.source_chat_graph, session_id
            )
            results.append(
                _source_session_response(
                    session,
                    source_id=source_id,
                    message_count=msg_count,
                )
            )

        # Sort sessions by created date (newest first)
        results.sort(key=lambda item: item.created, reverse=True)
        return results
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Source not found")
    except Exception as e:
        logger.error(f"Error fetching source chat sessions: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching source chat sessions: {str(e)}"
        )


@router.get(
    "/sources/{source_id}/chat/sessions/{session_id}",
    response_model=SourceChatSessionWithMessagesResponse,
)
async def get_source_chat_session(
    source_id: str = Path(..., description="Source ID"),
    session_id: str = Path(..., description="Session ID"),
):
    """Get a specific source chat session with its messages."""
    try:
        # Verify source exists
        full_source_id = normalize_source_id(source_id)
        source = await Source.get(full_source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Get session
        full_session_id = normalize_chat_session_id(session_id)
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await _assert_source_session_relation(full_session_id, full_source_id)

        # Get session state from LangGraph to retrieve messages
        thread_state = await source_chat_module.source_chat_graph.aget_state(
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )

        # Extract messages from state
        messages: list[ChatMessage] = []
        context_indicators = None

        if thread_state and thread_state.values:
            for entry in hydrate_langgraph_messages(thread_state.values):
                messages.append(ChatMessage(**entry))

            # Extract context indicators from the last state
            if "context_indicators" in thread_state.values:
                context_data = thread_state.values["context_indicators"]
                context_indicators = ContextIndicator(
                    sources=context_data.get("sources", []),
                    notes=context_data.get("notes", []),
                )

        return SourceChatSessionWithMessagesResponse(
            **_source_session_response(
                session,
                source_id=source_id,
                message_count=len(messages),
            ).model_dump(),
            messages=messages,
            context_indicators=context_indicators,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Source or session not found")
    except Exception as e:
        logger.error(f"Error fetching source chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching source chat session: {str(e)}"
        )


@router.put(
    "/sources/{source_id}/chat/sessions/{session_id}",
    response_model=SourceChatSessionResponse,
)
async def update_source_chat_session(
    request: UpdateSourceChatSessionRequest,
    source_id: str = Path(..., description="Source ID"),
    session_id: str = Path(..., description="Session ID"),
):
    """Update source chat session title and/or model override."""
    try:
        # Verify source exists
        full_source_id = normalize_source_id(source_id)
        source = await Source.get(full_source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Get session
        full_session_id = normalize_chat_session_id(session_id)
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await _assert_source_session_relation(full_session_id, full_source_id)

        # Update session fields
        if request.title is not None:
            session.title = request.title
        if request.model_override is not None:
            session.model_override = request.model_override
        if request.skill_ids is not None:
            session.skill_ids = request.skill_ids or []
        if request.collection_ids is not None:
            session.collection_ids = request.collection_ids or []
        if request.html_template_id is not None:
            session.html_template_id = request.html_template_id or None

        await session.save()

        # Get message count from LangGraph state
        msg_count = await get_session_message_count(source_chat_module.source_chat_graph, full_session_id)

        return _source_session_response(
            session,
            source_id=source_id,
            message_count=msg_count,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Source or session not found")
    except Exception as e:
        logger.error(f"Error updating source chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating source chat session: {str(e)}"
        )


@router.delete(
    "/sources/{source_id}/chat/sessions/{session_id}", response_model=SuccessResponse
)
async def delete_source_chat_session(
    source_id: str = Path(..., description="Source ID"),
    session_id: str = Path(..., description="Session ID"),
):
    """Delete a source chat session."""
    try:
        # Verify source exists
        full_source_id = normalize_source_id(source_id)
        source = await Source.get(full_source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Get session
        full_session_id = normalize_chat_session_id(session_id)
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await _assert_source_session_relation(full_session_id, full_source_id)

        try:
            await chat_queue_service.delete_session(full_session_id)
        except ChatQueueConflictError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        except ChatQueueNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e

        return SuccessResponse(
            success=True, message="Source chat session deleted successfully"
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Source or session not found")
    except Exception as e:
        logger.error(f"Error deleting source chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting source chat session: {str(e)}"
        )


@router.post("/sources/{source_id}/chat/sessions/{session_id}/messages")
async def send_message_to_source_chat(
    request: SendMessageRequest,
    source_id: str = Path(..., description="Source ID"),
    session_id: str = Path(..., description="Session ID"),
):
    """Send a message to source chat session with AG-UI SSE streaming response."""
    try:
        # Verify source exists
        full_source_id = normalize_source_id(source_id)
        source = await Source.get(full_source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Verify session exists and is related to source
        full_session_id = normalize_chat_session_id(session_id)
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await _assert_source_session_relation(full_session_id, full_source_id)

        if not request.message:
            raise HTTPException(status_code=400, detail="Message content is required")

        # Determine model override (request override takes precedence over session override)
        model_override = request.model_override or getattr(
            session, "model_override", None
        )

        skill_ids = resolve_session_skill_ids(session, request.skill_ids)
        collection_ids = resolve_session_collection_ids(
            session, request.collection_ids
        )
        html_template_id = resolve_session_html_template_id(
            session, request.html_template_id
        )
        html_template_id, html_template_meta = await resolve_html_template_meta(
            html_template_id,
            session=session,
        )

        # Update session timestamp (and skill_ids / html_template_id if changed)
        await session.save()

        # Skills + source context load inside the graph so AG-UI can stream steps.
        return ag_ui_agents.ag_ui_streaming_response(
            ag_ui_agents.source_chat_agent,
            ag_ui_agents.build_run_input(
                thread_id=full_session_id,
                message=request.message,
                forwarded_props={
                    "source_id": full_source_id,
                    "model_override": model_override,
                    "skill_ids": skill_ids,
                    "collection_ids": collection_ids,
                    "mcp_tool_ids": list(request.mcp_tool_ids or []),
                    "session_id": full_session_id,
                    "html_template_id": html_template_id if html_template_meta else None,
                    "html_template": html_template_meta,
                },
            ),
            configurable={"model_id": model_override},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending message to source chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error sending message: {str(e)}")

import asyncio
import traceback
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from langchain_core.runnables import RunnableConfig
from loguru import logger
from pydantic import BaseModel, Field

from api import ag_ui_agents
from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.artifact import Artifact
from construction_os.domain.project import ChatSession, Note, Project, Source
from construction_os.exceptions import (
    NotFoundError,
)
from construction_os.graphs import chat as chat_graph_module
from construction_os.utils.graph_utils import (
    get_session_message_count,
    truncate_messages_from_id,
)

router = APIRouter()


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


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = Field(None, description="New session title")
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )
    skill_ids: Optional[List[str]] = Field(
        None, description="Skill IDs selected for this session"
    )


class ChatMessage(BaseModel):
    id: str = Field(..., description="Message ID")
    type: str = Field(..., description="Message type (human|ai)")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp")


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


@router.get("/chat/sessions", response_model=List[ChatSessionResponse])
async def get_sessions(project_id: str = Query(..., description="Project ID")):
    """Get all chat sessions for a Project."""
    try:
        # Get Project to verify it exists
        project = await Project.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get sessions for this Project
        sessions_list = await project.get_chat_sessions()

        results = []
        for session in sessions_list:
            session_id = str(session.id)

            # Get message count from LangGraph state
            msg_count = await get_session_message_count(chat_graph_module.graph, session_id)

            results.append(
                ChatSessionResponse(
                    id=session.id or "",
                    title=session.title or "Untitled Session",
                    project_id=project_id,
                    created=str(session.created),
                    updated=str(session.updated),
                    message_count=msg_count,
                    model_override=getattr(session, "model_override", None),
                    skill_ids=getattr(session, "skill_ids", None) or [],
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
async def create_session(request: CreateSessionRequest):
    """Create a new chat session."""
    try:
        # Verify Project exists
        project = await Project.get(request.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Create new session
        session = ChatSession(
            title=request.title
            or f"Chat Session {asyncio.get_event_loop().time():.0f}",
            model_override=request.model_override,
            skill_ids=request.skill_ids or [],
        )
        await session.save()

        # Relate session to Project
        await session.relate_to_project(request.project_id)

        return ChatSessionResponse(
            id=session.id or "",
            title=session.title or "",
            project_id=request.project_id,
            created=str(session.created),
            updated=str(session.updated),
            message_count=0,
            model_override=session.model_override,
            skill_ids=session.skill_ids or [],
        )
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
async def get_session(session_id: str):
    """Get a specific session with its messages."""
    try:
        # Get session
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get session state from LangGraph to retrieve messages
        thread_state = await chat_graph_module.graph.aget_state(
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )

        # Extract messages from state
        messages: list[ChatMessage] = []
        if thread_state and thread_state.values and "messages" in thread_state.values:
            for msg in thread_state.values["messages"]:
                messages.append(
                    ChatMessage(
                        id=getattr(msg, "id", f"msg_{len(messages)}"),
                        type=msg.type if hasattr(msg, "type") else "unknown",
                        content=msg.content if hasattr(msg, "content") else str(msg),
                        timestamp=None,  # LangChain messages don't have timestamps by default
                    )
                )

        # Find project_id (we need to query the relationship)
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )

        project_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )

        project_id = project_query[0]["out"] if project_query else None

        if not project_id:
            # This might be an old session created before API migration
            logger.warning(
                f"No Project relationship found for session {session_id} - may be an orphaned session"
            )

        return ChatSessionWithMessagesResponse(
            id=session.id or "",
            title=session.title or "Untitled Session",
            project_id=project_id,
            created=str(session.created),
            updated=str(session.updated),
            message_count=len(messages),
            messages=messages,
            model_override=getattr(session, "model_override", None),
            skill_ids=getattr(session, "skill_ids", None) or [],
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error fetching session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching session: {str(e)}")


@router.put("/chat/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_session(session_id: str, request: UpdateSessionRequest):
    """Update session title."""
    try:
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        update_data = request.model_dump(exclude_unset=True)

        if "title" in update_data:
            session.title = update_data["title"]

        if "model_override" in update_data:
            session.model_override = update_data["model_override"]

        if "skill_ids" in update_data:
            session.skill_ids = update_data["skill_ids"] or []

        await session.save()

        # Find project_id
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        project_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )
        project_id = project_query[0]["out"] if project_query else None

        # Get message count from LangGraph state
        msg_count = await get_session_message_count(chat_graph_module.graph, full_session_id)

        return ChatSessionResponse(
            id=session.id or "",
            title=session.title or "",
            project_id=project_id,
            created=str(session.created),
            updated=str(session.updated),
            message_count=msg_count,
            model_override=session.model_override,
            skill_ids=session.skill_ids or [],
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error updating session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating session: {str(e)}")


@router.delete("/chat/sessions/{session_id}", response_model=SuccessResponse)
async def delete_session(session_id: str):
    """Delete a chat session."""
    try:
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await session.delete()

        return SuccessResponse(success=True, message="Session deleted successfully")
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")


@router.post("/chat/execute")
async def execute_chat(request: ExecuteChatRequest):
    """Execute a chat request and stream AG-UI events."""
    try:
        # Verify session exists
        # Ensure session_id has proper table prefix
        full_session_id = (
            request.session_id
            if request.session_id.startswith("chat_session:")
            else f"chat_session:{request.session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Fetch Project linked to this session
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

        # Determine model override (per-request override takes precedence over session-level)
        model_override = (
            request.model_override
            if request.model_override is not None
            else getattr(session, "model_override", None)
        )

        # Resolve skills: request wins when provided; otherwise use session-stored selection
        # Skills are loaded inside the graph (loading_skills step) so AG-UI can stream it.
        if request.skill_ids is not None:
            skill_ids = list(request.skill_ids)
            session.skill_ids = skill_ids
        else:
            skill_ids = list(getattr(session, "skill_ids", None) or [])

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

        # Update session timestamp (and skill_ids if changed) before streaming
        await session.save()

        artifact_meta = None
        if request.artifact_id:
            artifact = await Artifact.get(request.artifact_id)
            if artifact:
                artifact_meta = {
                    "id": artifact.id,
                    "name": artifact.name,
                    "title": artifact.title,
                    "description": artifact.description,
                    "prompt": artifact.prompt,
                }

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
                "mcp_tool_ids": list(request.mcp_tool_ids or []),
                "session_id": full_session_id,
                "artifact_id": request.artifact_id if artifact_meta else None,
                "artifact": artifact_meta,
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
        # Log detailed error with context for debugging
        logger.error(
            f"Error executing chat: {str(e)}\n"
            f"  Session ID: {request.session_id}\n"
            f"  Model override: {request.model_override}\n"
            f"  Traceback:\n{traceback.format_exc()}"
        )
        raise HTTPException(status_code=500, detail=f"Error executing chat: {str(e)}")


@router.post("/chat/context", response_model=BuildContextResponse)
async def build_context(request: BuildContextRequest):
    """Build context for a Project based on context configuration."""
    try:
        # Verify Project exists
        project = await Project.get(request.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        context_data: dict[str, list[dict[str, str]]] = {"sources": [], "notes": []}
        total_content = ""

        # Process context configuration if provided
        if request.context_config:
            # Process sources
            for source_id, status in request.context_config.get("sources", {}).items():
                if "not in" in status:
                    continue

                try:
                    # Add table prefix if not present
                    full_source_id = (
                        source_id
                        if source_id.startswith("source:")
                        else f"source:{source_id}"
                    )

                    try:
                        source = await Source.get(full_source_id)
                    except Exception:
                        continue

                    if "insights" in status:
                        source_context = await source.get_context(context_size="short")
                        context_data["sources"].append(source_context)
                        total_content += str(source_context)
                    elif "full content" in status:
                        source_context = await source.get_context(context_size="long")
                        context_data["sources"].append(source_context)
                        total_content += str(source_context)
                except Exception as e:
                    logger.warning(f"Error processing source {source_id}: {str(e)}")
                    continue

            # Process notes
            for note_id, status in request.context_config.get("notes", {}).items():
                if "not in" in status:
                    continue

                try:
                    # Add table prefix if not present
                    full_note_id = (
                        note_id if note_id.startswith("note:") else f"note:{note_id}"
                    )
                    note = await Note.get(full_note_id)
                    if not note:
                        continue

                    if "full content" in status:
                        note_context = note.get_context(context_size="long")
                        context_data["notes"].append(note_context)
                        total_content += str(note_context)
                except Exception as e:
                    logger.warning(f"Error processing note {note_id}: {str(e)}")
                    continue
        else:
            # Default behavior - include all sources and notes with short context
            sources = await project.get_sources()
            for source in sources:
                try:
                    source_context = await source.get_context(context_size="short")
                    context_data["sources"].append(source_context)
                    total_content += str(source_context)
                except Exception as e:
                    logger.warning(f"Error processing source {source.id}: {str(e)}")
                    continue

            notes = await project.get_notes()
            for note in notes:
                try:
                    note_context = note.get_context(context_size="short")
                    context_data["notes"].append(note_context)
                    total_content += str(note_context)
                except Exception as e:
                    logger.warning(f"Error processing note {note.id}: {str(e)}")
                    continue

        # Calculate character and token counts
        char_count = len(total_content)
        # Use token count utility if available
        try:
            from construction_os.utils import token_count

            estimated_tokens = token_count(total_content) if total_content else 0
        except ImportError:
            # Fallback to simple estimation
            estimated_tokens = char_count // 4

        return BuildContextResponse(
            context=context_data, token_count=estimated_tokens, char_count=char_count
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building context: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error building context: {str(e)}")

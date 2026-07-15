"""FastAPI routes for persistent per-session chat queues."""

from __future__ import annotations

from typing import AsyncGenerator, Awaitable, Optional, TypeVar

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse

from api.chat_queue_service import (
    ChatQueueConflictError,
    ChatQueueForbiddenError,
    ChatQueueNotFoundError,
    ChatQueueServiceError,
    ChatQueueSubmissionError,
    ChatQueueValidationError,
    chat_queue_service,
    resolve_stream_after_revision,
)
from api.models import (
    ChatQueueItemEnqueueRequest,
    ChatQueueItemResponse,
    ChatQueueItemUpdateRequest,
    ChatQueueReorderRequest,
    ChatQueueResponse,
    ChatQueueStateUpdateRequest,
)

router = APIRouter()
ResultT = TypeVar("ResultT")


async def _service_result(operation: Awaitable[ResultT]) -> ResultT:
    try:
        return await operation
    except ChatQueueNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ChatQueueForbiddenError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ChatQueueConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ChatQueueValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ChatQueueSubmissionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ChatQueueServiceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        # Surreal transaction aborts and other unexpected failures must still
        # return JSON with CORS so the browser does not mask them as Network Error.
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get(
    "/chat/sessions/{session_id}/queue",
    response_model=ChatQueueResponse,
)
async def get_queue(session_id: str) -> ChatQueueResponse:
    """Return a private session's persisted queue and ordered items."""
    return await _service_result(chat_queue_service.get_queue(session_id))


@router.post(
    "/chat/sessions/{session_id}/queue/items",
    response_model=ChatQueueItemResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def enqueue_item(
    session_id: str,
    request: ChatQueueItemEnqueueRequest,
) -> ChatQueueItemResponse:
    """Idempotently enqueue a validated immutable execution snapshot."""
    return await _service_result(chat_queue_service.enqueue(session_id, request))


@router.patch(
    "/chat/sessions/{session_id}/queue",
    response_model=ChatQueueResponse,
)
async def update_queue(
    session_id: str,
    request: ChatQueueStateUpdateRequest,
) -> ChatQueueResponse:
    """Pause future claims or resume and schedule pending work."""
    return await _service_result(
        chat_queue_service.update_queue(session_id, request.status)
    )


@router.patch(
    "/chat/sessions/{session_id}/queue/items/{item_id}",
    response_model=ChatQueueItemResponse,
)
async def update_item(
    session_id: str,
    item_id: str,
    request: ChatQueueItemUpdateRequest,
) -> ChatQueueItemResponse:
    """Edit an owned pending or failed queue item."""
    return await _service_result(
        chat_queue_service.update_item(session_id, item_id, request)
    )


@router.delete(
    "/chat/sessions/{session_id}/queue/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_item(session_id: str, item_id: str) -> Response:
    """Delete an owned pending or failed queue item."""
    await _service_result(chat_queue_service.delete_item(session_id, item_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/chat/sessions/{session_id}/queue/order",
    response_model=ChatQueueResponse,
)
async def reorder_items(
    session_id: str,
    request: ChatQueueReorderRequest,
) -> ChatQueueResponse:
    """Reorder the exact pending item set using optimistic revision control."""
    return await _service_result(chat_queue_service.reorder(session_id, request))


@router.post(
    "/chat/sessions/{session_id}/queue/items/{item_id}/retry",
    response_model=ChatQueueItemResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_item(session_id: str, item_id: str) -> ChatQueueItemResponse:
    """Reset an owned failed item and schedule it when the queue is active."""
    return await _service_result(
        chat_queue_service.retry_item(session_id, item_id)
    )


@router.get("/chat/sessions/{session_id}/queue/stream")
async def stream_queue(
    session_id: str,
    request: Request,
    after_revision: Optional[int] = Query(default=None, ge=0),
    last_event_id: Optional[str] = Header(default=None, alias="Last-Event-ID"),
) -> StreamingResponse:
    """Stream revisioned persisted snapshots and JSON heartbeat events."""
    await _service_result(chat_queue_service.get_queue(session_id))
    try:
        cursor = resolve_stream_after_revision(after_revision, last_event_id)
    except ChatQueueValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    async def generate_events() -> AsyncGenerator[str, None]:
        async for event in chat_queue_service.stream_events(
            session_id,
            after_revision=cursor,
            is_disconnected=request.is_disconnected,
        ):
            yield (
                f"id: {event.revision}\n"
                f"event: {event.event}\n"
                f"data: {event.model_dump_json()}\n\n"
            )

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

"""Shared tool-call audit helpers used by native and MCP executors."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Any, Optional

from loguru import logger

from langchain_core.runnables import RunnableConfig

from construction_os.domain.mcp import ChatToolCall
from construction_os.mcp.result_text import bound_error_message
from construction_os.tool_runtime.progress import emit_tool_call


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DuplicateCallGuard:
    """Prevent identical (runtime_name, args) calls within one chat turn."""

    def __init__(self) -> None:
        self._seen: set[str] = set()

    @staticmethod
    def _key(runtime_name: str, arguments: dict[str, Any]) -> str:
        payload = json.dumps(arguments, sort_keys=True, default=str)
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
        return f"{runtime_name}:{digest}"

    def check_and_record(self, runtime_name: str, arguments: dict[str, Any]) -> bool:
        """Return True if this is a duplicate (already seen)."""
        key = self._key(runtime_name, arguments)
        if key in self._seen:
            return True
        self._seen.add(key)
        return False


def begin_audit(
    *,
    session_id: str,
    tool_name: str,
    runtime_name: str,
    tool_source: str,
    arguments: Optional[dict[str, Any]] = None,
    message_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    tool_id: Optional[str] = None,
    connection_name: Optional[str] = None,
    risk_level: Optional[str] = None,
    performed_write: bool = False,
) -> ChatToolCall:
    """Create an in-memory audit row (caller saves + emits)."""
    now = utcnow_iso()
    return ChatToolCall(
        session_id=session_id,
        message_id=message_id,
        connection_id=connection_id,
        tool_id=tool_id,
        tool_name=tool_name,
        connection_name=connection_name,
        risk_level=risk_level,
        runtime_name=runtime_name,
        arguments=arguments or {},
        status="requested",
        tool_source=tool_source,
        performed_write=performed_write,
        started_at=now,
    )


async def save_and_emit(
    audit: ChatToolCall,
    config: Optional[RunnableConfig] = None,
) -> ChatToolCall:
    await audit.save()
    emit_tool_call(audit, config)
    return audit


def finalize_timing(audit: ChatToolCall) -> None:
    """Set completed_at / duration_ms from started_at when possible."""
    audit.completed_at = utcnow_iso()
    if audit.started_at:
        try:
            start = datetime.fromisoformat(audit.started_at)
            end = datetime.fromisoformat(audit.completed_at)
            audit.duration_ms = int((end - start).total_seconds() * 1000)
        except (TypeError, ValueError):
            audit.duration_ms = None


async def reject_unauthorized(
    *,
    session_id: str,
    runtime_name: str,
    arguments: Any,
    message_id: Optional[str] = None,
    reason: str = "Tool is not in the authorized allowlist",
    config: Optional[RunnableConfig] = None,
    tool_source: str = "mcp",
) -> ChatToolCall:
    """Record a rejected off-allowlist tool request."""
    display_name = runtime_name
    if runtime_name.startswith("native__"):
        display_name = runtime_name[len("native__") :]
        tool_source = "native"
    audit = begin_audit(
        session_id=session_id,
        tool_name=display_name,
        runtime_name=runtime_name,
        tool_source=tool_source,
        arguments=arguments if isinstance(arguments, dict) else {},
        message_id=message_id,
    )
    audit.status = "rejected"
    audit.error = bound_error_message(reason)
    audit.error_category = "unauthorized"
    finalize_timing(audit)
    await save_and_emit(audit, config)
    logger.info("Tool unauthorized reject runtime={}", runtime_name)
    return audit


def wall_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)

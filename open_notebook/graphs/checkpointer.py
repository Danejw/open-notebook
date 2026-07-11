"""Shared async LangGraph checkpointer for chat graphs."""

from __future__ import annotations

from typing import Optional

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from loguru import logger

from open_notebook.config import LANGGRAPH_CHECKPOINT_FILE

_conn: Optional[aiosqlite.Connection] = None
_checkpointer: Optional[AsyncSqliteSaver] = None


async def init_checkpointer() -> AsyncSqliteSaver:
    """Open AsyncSqliteSaver for the process lifetime (call from FastAPI lifespan)."""
    global _conn, _checkpointer
    if _checkpointer is not None:
        return _checkpointer

    logger.info(f"Initializing AsyncSqliteSaver at {LANGGRAPH_CHECKPOINT_FILE}")
    _conn = await aiosqlite.connect(LANGGRAPH_CHECKPOINT_FILE)
    _conn.row_factory = aiosqlite.Row
    _checkpointer = AsyncSqliteSaver(_conn)
    await _checkpointer.setup()
    return _checkpointer


def get_checkpointer() -> AsyncSqliteSaver:
    if _checkpointer is None:
        raise RuntimeError(
            "LangGraph checkpointer is not initialized. "
            "Ensure API lifespan called init_checkpointer()."
        )
    return _checkpointer


async def close_checkpointer() -> None:
    """Close the shared aiosqlite connection on shutdown."""
    global _conn, _checkpointer
    if _conn is not None:
        await _conn.close()
    _conn = None
    _checkpointer = None

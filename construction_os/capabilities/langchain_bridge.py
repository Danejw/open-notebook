"""Bind native capability handlers as LangChain StructuredTools."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import StructuredTool
from loguru import logger
from pydantic import BaseModel

from construction_os.capabilities.models import CapabilityRuntimeContext
from construction_os.capabilities.registry import (
    RegisteredNativeTool,
    bindable_native_tools,
    runtime_name,
)
from construction_os.exceptions import ConstructionOSError
from construction_os.mcp.limits import MAX_RESULT_CHARS
from construction_os.mcp.result_text import bound_error_message
from construction_os.tool_runtime.execution import (
    DuplicateCallGuard,
    begin_audit,
    finalize_timing,
    save_and_emit,
)


def build_native_langchain_tools(
    ctx: CapabilityRuntimeContext,
    *,
    guard: Optional[DuplicateCallGuard] = None,
    config: Optional[RunnableConfig] = None,
) -> list[StructuredTool]:
    """Create LangChain tools for bindable native capabilities."""
    call_guard = guard or DuplicateCallGuard()
    tools: list[StructuredTool] = []
    for entry in bindable_native_tools(ctx):
        tools.append(
            _make_native_tool(
                entry,
                ctx=ctx,
                guard=call_guard,
                config=config,
            )
        )
    return tools


def _make_native_tool(
    entry: RegisteredNativeTool,
    *,
    ctx: CapabilityRuntimeContext,
    guard: DuplicateCallGuard,
    config: Optional[RunnableConfig],
) -> StructuredTool:
    rname = runtime_name(entry.name)
    args_schema = entry.input_model

    async def _arun(
        _tool_call_id: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        return await execute_native_tool(
            entry,
            kwargs,
            ctx=ctx,
            guard=guard,
            config=config,
            tool_call_id=_tool_call_id,
        )

    async def _arun_wrapped(**kwargs: Any) -> str:
        return await _arun(**kwargs)

    def _run(**kwargs: Any) -> str:
        return asyncio.get_event_loop().run_until_complete(_arun_wrapped(**kwargs))

    return StructuredTool.from_function(
        coroutine=_arun_wrapped,
        func=_run,
        name=rname,
        description=entry.description,
        args_schema=args_schema,
    )


async def execute_native_tool(
    entry: RegisteredNativeTool,
    arguments: Any,
    *,
    ctx: CapabilityRuntimeContext,
    guard: Optional[DuplicateCallGuard] = None,
    config: Optional[RunnableConfig] = None,
    tool_call_id: Optional[str] = None,
) -> str:
    """Validate, audit, and execute one native capability handler."""
    args = arguments if isinstance(arguments, dict) else {}
    rname = runtime_name(entry.name)
    audit = begin_audit(
        session_id=ctx.session_id,
        tool_name=entry.name,
        runtime_name=rname,
        tool_source="native",
        arguments=args,
        message_id=ctx.message_id,
        risk_level="write" if entry.performed_write else "read",
        performed_write=entry.performed_write,
    )
    await save_and_emit(audit, config)

    if guard and guard.check_and_record(rname, args):
        audit.status = "rejected"
        audit.error = "Duplicate tool call with identical arguments in this turn"
        audit.error_category = "duplicate"
        finalize_timing(audit)
        await save_and_emit(audit, config)
        return (
            f"Tool rejected: {audit.error}. "
            "Do not retry the same unauthorized or invalid request."
        )

    try:
        parsed = entry.input_model.model_validate(args)
    except Exception as exc:
        audit.status = "rejected"
        audit.error = bound_error_message(str(exc))
        audit.error_category = "validation"
        finalize_timing(audit)
        await save_and_emit(audit, config)
        return f"Tool rejected: {audit.error}."

    audit.status = "running"
    await save_and_emit(audit, config)

    try:
        handler = entry.handler
        if entry.name == "save_project_artifact":
            # Prefer explicit key, then LangChain tool_call_id, then audit row id
            result = await handler(
                ctx,
                parsed,
                tool_call_id=tool_call_id or (str(audit.id) if audit.id else None),
            )
        else:
            result = await handler(ctx, parsed)
        text = _result_to_text(result)
        audit.result_text = text
        audit.status = "succeeded"
        audit.error = None
        finalize_timing(audit)
        await save_and_emit(audit, config)
        logger.info("Native tool succeeded name={}", entry.name)
        return text
    except ConstructionOSError as exc:
        audit.status = "failed"
        audit.error = bound_error_message(str(exc))
        audit.error_category = type(exc).__name__
        finalize_timing(audit)
        await save_and_emit(audit, config)
        return f"Tool failed: {audit.error}"
    except Exception as exc:
        audit.status = "failed"
        audit.error = bound_error_message(str(exc))
        audit.error_category = "internal"
        finalize_timing(audit)
        await save_and_emit(audit, config)
        logger.warning("Native tool failed name={}", entry.name)
        return f"Tool failed: {audit.error}"


def _result_to_text(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, BaseModel):
        payload = result.model_dump(mode="json")
    elif isinstance(result, dict):
        payload = result
    else:
        payload = {"result": result}
    text = json.dumps(payload, default=str, ensure_ascii=False)
    if len(text) > MAX_RESULT_CHARS:
        return text[: MAX_RESULT_CHARS - 14] + "...[truncated]"
    return text

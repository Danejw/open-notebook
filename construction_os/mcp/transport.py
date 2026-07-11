"""MCP Streamable HTTP transport — JSON-RPC over HTTP with SSE support."""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

import httpx
from loguru import logger

from construction_os.mcp.limits import (
    MAX_ERROR_CHARS,
    MAX_LOG_DETAIL_CHARS,
    MCP_PROTOCOL_VERSION,
    MCP_REQUEST_TIMEOUT_SECONDS,
)
from construction_os.mcp.result_text import bound_error_message


class McpTransportError(Exception):
    """Safe application error for MCP transport failures."""


class McpStreamableHttpTransport:
    """
    Minimal Streamable HTTP MCP transport.

    Supports initialize, notifications/initialized, tools/list, tools/call.
    Does not log Authorization headers or bearer tokens.
    """

    def __init__(
        self,
        endpoint_url: str,
        *,
        bearer_token: Optional[str] = None,
        timeout_seconds: float = MCP_REQUEST_TIMEOUT_SECONDS,
        protocol_version: str = MCP_PROTOCOL_VERSION,
    ) -> None:
        self.endpoint_url = endpoint_url
        self._bearer_token = bearer_token
        self.timeout_seconds = timeout_seconds
        self.protocol_version = protocol_version
        self.session_id: Optional[str] = None
        self.server_info: Optional[dict[str, Any]] = None
        self.capabilities: Optional[dict[str, Any]] = None
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _headers(self, *, notification: bool = False) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": self.protocol_version,
        }
        if self._bearer_token:
            headers["Authorization"] = f"Bearer {self._bearer_token}"
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        return headers

    async def initialize(self) -> dict[str, Any]:
        """Send initialize and capture session + server info."""
        params = {
            "protocolVersion": self.protocol_version,
            "capabilities": {},
            "clientInfo": {"name": "construction-os", "version": "1.0.0"},
        }
        result = await self._request("initialize", params)
        if isinstance(result, dict):
            self.server_info = result.get("serverInfo")
            self.capabilities = result.get("capabilities")
            negotiated = result.get("protocolVersion")
            if isinstance(negotiated, str) and negotiated:
                self.protocol_version = negotiated
        await self.initialized()
        return result if isinstance(result, dict) else {}

    async def initialized(self) -> None:
        """Send notifications/initialized (no response expected)."""
        await self._notify("notifications/initialized", {})

    async def list_tools(self) -> list[dict[str, Any]]:
        """Return tool descriptors from tools/list."""
        result = await self._request("tools/list", {})
        if not isinstance(result, dict):
            return []
        tools = result.get("tools") or []
        return [t for t in tools if isinstance(t, dict)]

    async def call_tool(
        self, name: str, arguments: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        """Call tools/call and return the result object."""
        result = await self._request(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
        )
        if isinstance(result, dict):
            return result
        return {"content": [{"type": "text", "text": str(result)}]}

    async def _notify(self, method: str, params: dict[str, Any]) -> None:
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    self.endpoint_url,
                    headers=self._headers(notification=True),
                    content=json.dumps(payload),
                )
                self._capture_session(response)
                # Notifications may return 202/204/200 with empty body
                if response.status_code >= 400:
                    raise McpTransportError(
                        bound_error_message(
                            f"MCP notification failed with HTTP {response.status_code}",
                            MAX_ERROR_CHARS,
                        )
                    )
        except httpx.TimeoutException as exc:
            logger.warning("MCP notification timeout method={}", method)
            raise McpTransportError("MCP request timed out") from exc
        except httpx.HTTPError as exc:
            logger.warning("MCP notification HTTP error method={}", method)
            raise McpTransportError(
                bound_error_message(f"MCP HTTP error: {exc}", MAX_ERROR_CHARS)
            ) from exc

    async def _request(self, method: str, params: dict[str, Any]) -> Any:
        req_id = self._next_id()
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params,
        }
        logger.info(
            "MCP request method={} endpoint={}",
            method,
            self.endpoint_url[:MAX_LOG_DETAIL_CHARS],
        )
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                follow_redirects=False,
            ) as client:
                response = await client.post(
                    self.endpoint_url,
                    headers=self._headers(),
                    content=json.dumps(payload),
                )
        except httpx.TimeoutException as exc:
            logger.warning("MCP timeout method={}", method)
            raise McpTransportError("MCP request timed out") from exc
        except httpx.HTTPError as exc:
            logger.warning("MCP HTTP error method={}", method)
            raise McpTransportError(
                bound_error_message(f"MCP HTTP error: {exc}", MAX_ERROR_CHARS)
            ) from exc

        self._capture_session(response)

        if response.status_code >= 400:
            raise McpTransportError(
                bound_error_message(
                    f"MCP HTTP {response.status_code}",
                    MAX_ERROR_CHARS,
                )
            )

        body = response.content or b""
        content_type = (response.headers.get("content-type") or "").lower()
        try:
            messages = parse_mcp_http_body(body, content_type)
        except McpTransportError:
            raise
        except Exception as exc:
            logger.warning("MCP parse failure method={}", method)
            raise McpTransportError("Malformed MCP response") from exc

        return extract_jsonrpc_result(messages, req_id)

    def _capture_session(self, response: httpx.Response) -> None:
        sid = response.headers.get("mcp-session-id") or response.headers.get(
            "Mcp-Session-Id"
        )
        if sid:
            self.session_id = sid


def parse_mcp_http_body(body: bytes, content_type: str) -> list[dict[str, Any]]:
    """
    Parse MCP HTTP response body into a list of JSON-RPC message dicts.

    Supports a single JSON object, a JSON array, and SSE frames.
    """
    text = (body or b"").decode("utf-8", errors="replace").strip()
    if not text:
        raise McpTransportError("Empty MCP response")

    if "text/event-stream" in content_type or text.startswith("event:") or "\ndata:" in text or text.startswith("data:"):
        return parse_sse_jsonrpc(text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise McpTransportError("Malformed MCP JSON response") from exc

    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    raise McpTransportError("Unexpected MCP JSON response shape")


def parse_sse_jsonrpc(text: str) -> list[dict[str, Any]]:
    """Extract JSON-RPC objects from SSE data frames."""
    messages: list[dict[str, Any]] = []
    data_lines: list[str] = []

    def flush() -> None:
        nonlocal data_lines
        if not data_lines:
            return
        payload = "\n".join(data_lines).strip()
        data_lines = []
        if not payload or payload == "[DONE]":
            return
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            return
        if isinstance(obj, dict):
            messages.append(obj)
        elif isinstance(obj, list):
            messages.extend(item for item in obj if isinstance(item, dict))

    for line in text.splitlines():
        if line == "":
            flush()
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        # ignore event:/id:/retry: lines
    flush()

    if not messages:
        raise McpTransportError("No JSON-RPC messages in SSE response")
    return messages


def extract_jsonrpc_result(messages: list[dict[str, Any]], request_id: int) -> Any:
    """Find the matching JSON-RPC response and return result or raise on error."""
    matched: Optional[dict[str, Any]] = None
    for msg in messages:
        if "id" in msg and msg.get("id") == request_id:
            matched = msg
            break
    if matched is None:
        # Some servers omit id matching — take first response with result/error
        for msg in messages:
            if "result" in msg or "error" in msg:
                matched = msg
                break
    if matched is None:
        raise McpTransportError("MCP response missing result")

    if "error" in matched and matched["error"] is not None:
        err = matched["error"]
        if isinstance(err, dict):
            message = err.get("message") or "MCP error"
            code = err.get("code")
            detail = f"MCP error {code}: {message}" if code is not None else str(message)
        else:
            detail = str(err)
        raise McpTransportError(bound_error_message(detail, MAX_ERROR_CHARS))

    return matched.get("result")

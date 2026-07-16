"""Minimal fake MCP Streamable HTTP server for tests."""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Optional


class FakeMcpState:
    """Mutable catalog / behavior for the fake MCP server."""

    def __init__(self) -> None:
        self.session_counter = 0
        self.delay_seconds = 0.0
        self.malformed = False
        self.use_sse = False
        self.require_bearer: Optional[str] = None
        self.tools: list[dict[str, Any]] = [
            {
                "name": "echo",
                "title": "Echo",
                "description": "Echo back the text argument",
                "inputSchema": {
                    "type": "object",
                    "required": ["text"],
                    "properties": {"text": {"type": "string"}},
                },
                "annotations": {"readOnlyHint": True},
            },
            {
                "name": "delete_thing",
                "title": "Delete",
                "description": "Delete something",
                "inputSchema": {
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                },
                "annotations": {"destructiveHint": True},
            },
        ]
        self.call_log: list[dict[str, Any]] = []
        self.force_tool_error = False


def make_handler(state: FakeMcpState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            return

        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                self._send(400, {"error": "bad json"})
                return

            if state.require_bearer:
                auth = self.headers.get("Authorization") or ""
                if auth != f"Bearer {state.require_bearer}":
                    self._send(401, {"error": "unauthorized"})
                    return

            if state.delay_seconds > 0:
                time.sleep(state.delay_seconds)

            method = payload.get("method")
            req_id = payload.get("id")

            if method == "notifications/initialized":
                self.send_response(202)
                self._maybe_session_header()
                self.end_headers()
                return

            if state.malformed and method != "initialize":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._maybe_session_header()
                self.end_headers()
                self.wfile.write(b"not-json{{{")
                return

            if method == "initialize":
                state.session_counter += 1
                result = {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "fake-mcp", "version": "0.1.0"},
                }
                self._jsonrpc(req_id, result, new_session=True)
                return

            if method == "tools/list":
                self._jsonrpc(req_id, {"tools": list(state.tools)})
                return

            if method == "tools/call":
                params = payload.get("params") or {}
                name = params.get("name")
                arguments = params.get("arguments") or {}
                state.call_log.append({"name": name, "arguments": arguments})
                if state.force_tool_error:
                    result = {
                        "content": [{"type": "text", "text": "tool failed"}],
                        "isError": True,
                    }
                elif name == "echo":
                    result = {
                        "content": [
                            {
                                "type": "text",
                                "text": str(arguments.get("text", "")),
                            }
                        ],
                        "isError": False,
                    }
                else:
                    result = {
                        "content": [
                            {"type": "text", "text": f"called {name}"}
                        ],
                        "isError": False,
                    }
                self._jsonrpc(req_id, result)
                return

            self._jsonrpc(
                req_id,
                error={"code": -32601, "message": f"Method not found: {method}"},
            )

        def _maybe_session_header(self) -> None:
            if state.session_counter:
                self.send_header(
                    "Mcp-Session-Id", f"sess-{state.session_counter}"
                )

        def _jsonrpc(
            self,
            req_id: Any,
            result: Any = None,
            *,
            error: Any = None,
            new_session: bool = False,
        ) -> None:
            body: dict[str, Any] = {"jsonrpc": "2.0", "id": req_id}
            if error is not None:
                body["error"] = error
            else:
                body["result"] = result

            if state.use_sse:
                data = f"event: message\ndata: {json.dumps(body)}\n\n"
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                if new_session or state.session_counter:
                    self._maybe_session_header()
                self.end_headers()
                self.wfile.write(data.encode("utf-8"))
                return

            self._send(200, body, new_session=new_session)

        def _send(
            self, code: int, body: dict[str, Any], *, new_session: bool = False
        ) -> None:
            data = json.dumps(body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            if new_session or state.session_counter:
                self._maybe_session_header()
            self.end_headers()
            self.wfile.write(data)

    return Handler


class FakeMcpServer:
    """Background HTTP server hosting a fake MCP endpoint at /mcp."""

    def __init__(self, host: str = "127.0.0.1", port: int = 0) -> None:
        self.state = FakeMcpState()
        handler = make_handler(self.state)
        self._httpd = HTTPServer((host, port), handler)
        self.host, self.port = self._httpd.server_address[0], self._httpd.server_address[1]
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}/"

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._httpd.shutdown()
        self._thread.join(timeout=2)

    def __enter__(self) -> "FakeMcpServer":
        self.start()
        return self

    def __exit__(self, *args: Any) -> None:
        self.stop()

"""High-level MCP session client facade."""

from __future__ import annotations

from typing import Any, Optional

from construction_os.mcp.transport import McpStreamableHttpTransport


class McpClient:
    """Session facade over Streamable HTTP transport."""

    def __init__(
        self,
        endpoint_url: str,
        *,
        bearer_token: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
    ) -> None:
        kwargs: dict[str, Any] = {"bearer_token": bearer_token}
        if timeout_seconds is not None:
            kwargs["timeout_seconds"] = timeout_seconds
        self.transport = McpStreamableHttpTransport(endpoint_url, **kwargs)

    @property
    def session_id(self) -> Optional[str]:
        return self.transport.session_id

    @property
    def server_info(self) -> Optional[dict[str, Any]]:
        return self.transport.server_info

    @property
    def capabilities(self) -> Optional[dict[str, Any]]:
        return self.transport.capabilities

    async def connect(self) -> dict[str, Any]:
        """Initialize session and return server initialize result."""
        return await self.transport.initialize()

    async def list_tools(self) -> list[dict[str, Any]]:
        return await self.transport.list_tools()

    async def call_tool(
        self, name: str, arguments: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        return await self.transport.call_tool(name, arguments)

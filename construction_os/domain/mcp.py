"""MCP connection, tool, and chat tool-call domain models."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, ClassVar, Dict, List, Optional

from loguru import logger

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.base import ObjectModel
from construction_os.utils.encryption import decrypt_value, encrypt_value


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class McpConnection(ObjectModel):
    """Remote MCP server registered for this instance."""

    table_name: ClassVar[str] = "mcp_connection"
    nullable_fields: ClassVar[set[str]] = {
        "auth_config",
        "server_info",
        "capabilities",
        "last_connected_at",
        "last_synced_at",
        "last_error",
        "owner",
    }

    name: str
    endpoint_url: str
    transport: str = "streamable_http"
    auth_type: str = "none"
    # Encrypted JSON string at rest, e.g. {"token":"..."}
    auth_config: Optional[str] = None
    status: str = "unknown"
    server_info: Optional[Dict[str, Any]] = None
    capabilities: Optional[Dict[str, Any]] = None
    last_connected_at: Optional[str] = None
    last_synced_at: Optional[str] = None
    last_error: Optional[str] = None
    owner: Optional[str] = None

    def _prepare_save_data(self) -> dict:
        data = super()._prepare_save_data()
        raw = data.get("auth_config")
        if raw and isinstance(raw, str) and not raw.startswith("gAAAAA"):
            # Encrypt plaintext JSON / token blob before persist
            data["auth_config"] = encrypt_value(raw)
        elif isinstance(raw, dict):
            data["auth_config"] = encrypt_value(json.dumps(raw))
        return data

    def get_auth_dict(self) -> Dict[str, Any]:
        """Decrypt auth_config to a dict (server-only)."""
        if not self.auth_config:
            return {}
        raw = self.auth_config
        try:
            decrypted = decrypt_value(raw)
        except Exception:
            decrypted = raw
        try:
            parsed = json.loads(decrypted)
            return parsed if isinstance(parsed, dict) else {"token": decrypted}
        except (json.JSONDecodeError, TypeError):
            return {"token": decrypted} if decrypted else {}

    def get_bearer_token(self) -> Optional[str]:
        if self.auth_type != "bearer":
            return None
        auth = self.get_auth_dict()
        token = auth.get("token") or auth.get("bearer_token")
        return str(token) if token else None

    def set_bearer_token(self, token: Optional[str]) -> None:
        if not token:
            self.auth_config = None
            return
        self.auth_config = json.dumps({"token": token})

    @classmethod
    async def get(cls, id: str) -> "McpConnection":
        instance = await super().get(id)
        if instance.auth_config:
            try:
                object.__setattr__(
                    instance, "auth_config", decrypt_value(instance.auth_config)
                )
            except Exception as e:
                logger.warning("Failed to decrypt MCP auth_config for {}: {}", id, e)
        return instance

    @classmethod
    async def get_all(cls, order_by: str = "name asc") -> List["McpConnection"]:
        items = await super().get_all(order_by=order_by)
        decrypted: List[McpConnection] = []
        for item in items:
            if item.auth_config:
                try:
                    object.__setattr__(
                        item, "auth_config", decrypt_value(item.auth_config)
                    )
                except Exception as e:
                    logger.warning(
                        "Failed to decrypt MCP auth_config for {}: {}", item.id, e
                    )
            decrypted.append(item)
        return decrypted


class McpTool(ObjectModel):
    """Tool discovered from an MCP connection."""

    table_name: ClassVar[str] = "mcp_tool"
    nullable_fields: ClassVar[set[str]] = {
        "title",
        "description",
        "input_schema",
        "output_schema",
        "annotations",
        "last_discovered_at",
        "owner",
    }

    connection: str
    name: str
    title: Optional[str] = None
    description: Optional[str] = None
    input_schema: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    annotations: Optional[Dict[str, Any]] = None
    risk_level: str = "unknown"
    available: bool = True
    last_discovered_at: Optional[str] = None
    owner: Optional[str] = None

    def _prepare_save_data(self) -> dict:
        data = super()._prepare_save_data()
        if data.get("connection"):
            data["connection"] = ensure_record_id(data["connection"])
        return data

    @classmethod
    async def get_by_connection(cls, connection_id: str) -> List["McpTool"]:
        results = await repo_query(
            "SELECT * FROM mcp_tool WHERE connection = $connection ORDER BY name ASC",
            {"connection": ensure_record_id(connection_id)},
        )
        return [cls(**row) for row in results]

    @classmethod
    async def find_by_connection_and_name(
        cls, connection_id: str, name: str
    ) -> Optional["McpTool"]:
        results = await repo_query(
            "SELECT * FROM mcp_tool WHERE connection = $connection AND name = $name LIMIT 1",
            {"connection": ensure_record_id(connection_id), "name": name},
        )
        if not results:
            return None
        return cls(**results[0])

    @classmethod
    async def list_selectable(cls) -> List[Dict[str, Any]]:
        """Available tools with connection name for the chat picker."""
        results = await repo_query(
            "SELECT * FROM mcp_tool WHERE available = true ORDER BY name ASC",
            {},
        )
        out: List[Dict[str, Any]] = []
        conn_cache: Dict[str, str] = {}
        for row in results:
            conn_id = str(row.get("connection") or "")
            if conn_id and conn_id not in conn_cache:
                try:
                    conn = await McpConnection.get(conn_id)
                    conn_cache[conn_id] = conn.name
                except Exception:
                    conn_cache[conn_id] = ""
            row = dict(row)
            row["connection_name"] = conn_cache.get(conn_id)
            row["connection_id"] = conn_id
            out.append(row)
        out.sort(
            key=lambda r: (
                (r.get("connection_name") or "").lower(),
                (r.get("name") or "").lower(),
            )
        )
        return out


class ChatToolCall(ObjectModel):
    """Audit record for an MCP tool execution attempt."""

    table_name: ClassVar[str] = "chat_tool_call"
    nullable_fields: ClassVar[set[str]] = {
        "message_id",
        "connection_id",
        "tool_id",
        "connection_name",
        "risk_level",
        "runtime_name",
        "arguments",
        "raw_result",
        "result_text",
        "error",
        "owner",
    }

    session_id: str
    message_id: Optional[str] = None
    connection_id: Optional[str] = None
    tool_id: Optional[str] = None
    tool_name: str
    connection_name: Optional[str] = None
    risk_level: Optional[str] = None
    runtime_name: Optional[str] = None
    arguments: Optional[Dict[str, Any]] = None
    raw_result: Optional[Dict[str, Any]] = None
    result_text: Optional[str] = None
    status: str = "requested"
    error: Optional[str] = None
    owner: Optional[str] = None

    @classmethod
    async def list_for_session(cls, session_id: str) -> List["ChatToolCall"]:
        results = await repo_query(
            "SELECT * FROM chat_tool_call WHERE session_id = $session_id ORDER BY created ASC",
            {"session_id": session_id},
        )
        return [cls(**row) for row in results]


def utcnow_iso() -> str:
    return _utcnow_iso()

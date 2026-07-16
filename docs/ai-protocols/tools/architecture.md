# Native tools architecture (Construction OS)

How Construction OS exposes **protocol-neutral native capabilities** as chat tools alongside allowlisted MCP tools.

**Related:** [catalog.md](./catalog.md) · [extending.md](./extending.md) · [MCP client](../mcp/client/architecture.md) · [AG-UI tool events](../agui/custom-events.md)

This is **not** the Cos-as-MCP-server surface for Claude Desktop / VS Code. That lives in [5-CONFIGURATION/mcp-integration.md](../../5-CONFIGURATION/mcp-integration.md).

---

## Mental model

```
graphs/chat.py (project chat, non-guest)
  → CapabilityRuntimeContext (trusted project/session + selections)
  → tool_runtime.generate_with_tools
       → native__*  (capabilities registry + langchain_bridge)
       → mcp__*     (allowlisted MCP tools)
  → ChatToolCall audit + AG-UI CUSTOM mcp_tool_call (tool_source=native|mcp)
  → ToolMessage JSON text back to the model
```

The model never invents project IDs or bypasses authz. It only sees tools the server bound for that turn.

`construction_os/mcp/chat_loop.generate_with_mcp_tools` is a compatibility wrapper around `tool_runtime.chat_loop.generate_with_tools`.

---

## Layers

| Layer | Responsibility | Canonical module |
|-------|----------------|------------------|
| Runtime context | Trusted IDs, selections, write gate flag | `capabilities/models.py` (`CapabilityRuntimeContext`) |
| Authz | Project/session link; guest reject; write gate | `capabilities/authz.py` |
| Handlers | One concern per module; Pydantic in/out | `capabilities/*.py` |
| Shared services | Reuse API mappers (HTML, artifact templates, project artifacts) | `construction_os/services/` |
| Registry | Declarative name/description/access/handler | `capabilities/registry.py` |
| LangChain bridge | `StructuredTool` + audit execute path | `capabilities/langchain_bridge.py` |
| Tool loop | Bounded native + MCP iterations | `tool_runtime/chat_loop.py` |
| Audit / progress | `ChatToolCall` + SSE CUSTOM events | `tool_runtime/execution.py`, `tool_runtime/progress.py` |
| Chat graph | Build context; call `generate_with_tools` | `graphs/chat.py` |

---

## CapabilityRuntimeContext

Built in `graphs/chat.py` when `project_id` + `session_id` are present and the turn is not a guest:

| Field | Role |
|-------|------|
| `project_id` / `session_id` | Trusted scope (never from tool args) |
| `allow_project_artifact_save` | Write gate for `save_project_artifact` |
| `enable_native_tools` | Master switch (false for guests) |
| `explicit_*` | User/session selections for this turn |
| `ephemeral_skill_ids` / `ephemeral_collection_ids` | Agent-loaded this turn only |
| `context_config` | Retrieval selection pool |
| `model_override` | Optional model for handlers that need it |

`bindable_native_tools(ctx)` drops all native tools for guests / when disabled, and drops `save_project_artifact` when the write gate is closed.

---

## Execution flow

1. Model requests a tool (`native__…` or `mcp__…`).
2. `DuplicateCallGuard` rejects identical args in the same turn.
3. Input validated against the registry `input_model`.
4. Handler runs with `(ctx, parsed_inputs)`.
5. Result serialized to JSON text (truncated at `MAX_RESULT_CHARS`).
6. Audit row updated; CUSTOM progress event emitted for the UI.

Failed / rejected calls return a short error string to the model (do not retry unauthorized duplicates).

---

## Selection precedence

1. Explicit user selections (session + UI)
2. Current artifact / project / chat configuration from UI
3. Agent-loaded capabilities for the current turn (`ephemeral_*`)
4. Default application behavior

---

## Security boundaries

- Guests: no native tools; empty MCP selections
- `require_project_session` verifies session ↔ project link
- Skill supporting-file reads use `normalize_relative_path` (blocks `..`)
- MCP secrets never returned from `list_tools` / `get_tool`
- Write tools must set `access="write"` / `performed_write=True` and enforce a server-side gate
- Future RBAC can extend `require_project_session` without rewriting every handler

---

## Testing

| Suite | Covers |
|-------|--------|
| `tests/test_native_capabilities.py` | Registry count/names, schemas, write gate, guest, path traversal, idempotency, mixed loop, duplicate guard |
| `tests/test_mcp_chat_loop.py` | MCP-only wrapper path |

---

## Related product docs

- Implementation snapshot: [docs/implementation/native-chat-tools-v1.md](../../implementation/native-chat-tools-v1.md)
- MCP allowlist / risk: [docs/ai-protocols/mcp/client/](../mcp/client/architecture.md)

# Native Chat Tools V1

Protocol-neutral Construction OS tools bound into project chat alongside allowlisted MCP tools.

**Study / extend home:** [docs/ai-protocols/tools/](../ai-protocols/tools/extending.md) ([catalog](../ai-protocols/tools/catalog.md) · [architecture](../ai-protocols/tools/architecture.md)).

## Final tool list

| Tool | Access | Purpose |
|------|--------|---------|
| `get_project_context` | read | Active project/session context and explicit selections |
| `search_project_knowledge` | read | Project-scoped hybrid/vector evidence with provenance |
| `list_skills` | read | Non-archived skill catalog |
| `get_skill` | read | SKILL.md or supporting file (turn-only; no session persist) |
| `list_collections` | read | Non-archived collection catalog |
| `get_collection` | read | Chat prompt injection block (turn-only) |
| `list_tools` | read | **External/MCP tools only** (discovery ≠ execution) |
| `get_tool` | read | One MCP tool schema/metadata (no execute) |
| `list_output_templates` | read | HTML / structured output template metadata (no body) |
| `get_output_template` | read | One HTML / structured output template with body |
| `list_artifact_templates` | read | Artifact template catalog + defaults |
| `get_artifact_template` | read | One artifact template with prompt + defaults (no execute) |
| `run_artifact_template` | read | Generate output without saving |
| `save_project_artifact` | write | Persist a Project Artifact (gated) |

## Capability handler locations

```text
construction_os/capabilities/
  models.py              # CapabilityRuntimeContext
  authz.py               # require_project_session, write gate
  registry.py            # declarative tool metadata
  langchain_bridge.py    # LangChain StructuredTool binding
  context.py
  retrieval.py
  skills.py
  collections.py
  tools.py
  output_templates.py
  artifact_templates.py
  project_artifacts.py

construction_os/tool_runtime/
  chat_loop.py           # generate_with_tools (canonical)
  execution.py           # DuplicateCallGuard, audit helpers
  progress.py            # AG-UI tool_call / mcp_tool_call events

construction_os/services/
  html_templates.py      # shared mapper for API + capabilities
  artifact_templates.py  # list/get/execute
  project_artifacts.py   # create + idempotency
```

`construction_os/mcp/chat_loop.generate_with_mcp_tools` is a compatibility wrapper around `tool_runtime.chat_loop.generate_with_tools`.

## Schemas

Each tool has a Pydantic input model in its capability module (e.g. `SearchProjectKnowledgeInput`). Outputs are Pydantic models serialized to JSON for the model. Project/session IDs are **never** accepted from tool arguments; they come from `CapabilityRuntimeContext`.

## Native + MCP execution flow

```text
graphs/chat.py generating
  → build CapabilityRuntimeContext (project chat, non-guest)
  → tool_runtime.generate_with_tools
       → native tools (native__*) + MCP allowlisted tools (mcp__*)
       → shared bounds: MAX_TOOL_ITERATIONS, MAX_TOOL_CALLS, DuplicateCallGuard
       → ChatToolCall audit + mcp_tool_call CUSTOM events
```

### Runtime vs UI naming

- LangChain / runtime name: `native__get_project_context`
- UI, docs, audit `tool_name`: `get_project_context`

### What `list_tools` means

- Lists **external/MCP** tools from `McpTool.list_selectable()` + `public_tool()`.
- Native Construction OS tools are automatic and are **not** in this catalog.
- Discovery does not authorize execution.
- An MCP tool is executable only when selected and allowlisted.

## Manual selection precedence

1. Explicit user selections (session + UI)
2. Current artifact / project / chat configuration from UI
3. Agent-loaded capabilities for the current turn only (`ephemeral_*` on runtime context)
4. Default application behavior

`get_skill` / `get_collection` / `get_output_template` / `get_artifact_template` / `run_artifact_template` do **not** call session persistence helpers.

## Write behavior (`save_project_artifact`)

1. Server sets `allow_project_artifact_save` when `requests_project_artifact_save(user_message)` matches save/create/preserve intent.
2. Handler rejects if the flag is false.
3. Idempotency key = tool argument, else audit/tool-call id, stored on `ProjectArtifact.save_idempotency_key`.
4. Retries with the same key return the existing Project Artifact.
5. Frontend invalidates `QUERY_KEYS.projectArtifacts(projectId)` on succeeded native write.

No draft lifecycle or approval UI in V1.

## Security boundaries

- Trusted `project_id` / `session_id` from server runtime; `session_refers_to` check in `authz.py`
- Guests: no native tools, empty MCP selections (unchanged)
- Skill file reads use `normalize_relative_path` (blocks `..`)
- MCP secrets never returned from `list_tools` / `get_tool`
- Result text truncated (`MAX_RESULT_CHARS`)
- Future RBAC can extend `require_project_session` without rewriting handlers

## Testing coverage

- `tests/test_native_capabilities.py` — registry, schemas, write gate, guest, path traversal, precedence, idempotency, mixed native+MCP loop, duplicate guard
- `tests/test_mcp_chat_loop.py` — still covers MCP-only wrapper path

## Deferred AutoScope V2

Not implemented: skill/collection/template/MCP admin CRUD, source upload, web search, deep research, URL ingestion, KG rebuild, deletions, queue admin.

## Deviations from the original prompt

| Topic | Decision |
|-------|----------|
| HTML tool names | `list_output_templates` / `get_output_template` (not generic `list_templates`) |
| Artifact get vs run | `get_artifact_template` loads prompt/defaults; `run_artifact_template` executes |
| Unified loop location | Moved to `construction_os/tool_runtime/` (not under `mcp/`) |
| Idempotency | Stored on Project Artifact; no separate table |
| Write authorization | Conversation intent + `allow_project_artifact_save` flag (no approval framework) |
| Scope | Project chat only |
| Event name | Still emit `mcp_tool_call` for compatibility; payload includes `tool_source` |

# Extending native tools in Construction OS

How to add or change **native** chat capabilities without forking the tool loop, audit path, or MCP stack.

**Related:** [catalog.md](./catalog.md) · [architecture.md](./architecture.md) · [MCP client extending](../mcp/client/extending.md)

---

## Mental model

Native tools are **Construction OS capabilities** bound as LangChain `StructuredTool`s with a `native__` runtime prefix. Domain logic lives in handlers + shared services; the registry is declarative metadata; `tool_runtime` owns the bounded loop and audit.

```
New capability handler
  → register in capabilities/registry.py
  → langchain_bridge builds StructuredTool
  → generate_with_tools binds it next to MCP tools
  → ChatToolCall + CUSTOM mcp_tool_call (tool_source=native)
```

**Anti-patterns to reject:**

- A second chat tool loop beside `tool_runtime.chat_loop.generate_with_tools`
- Accepting `project_id` / `session_id` from tool arguments
- Duplicating HTML/artifact/project-artifact mappers instead of using `construction_os/services/`
- Binding a write tool without a server-side gate (intent flag or stronger authz)
- Putting native tools into `list_tools` (that catalog is MCP-only by design)
- Logging secrets or returning MCP auth configs from discovery tools

---

## What you already get (do not rebuild)

| Concern | Owner | Extend by… |
|---------|-------|------------|
| Runtime context | `models.py` | Add fields only when many handlers need them |
| Authz | `authz.py` | New gates next to `require_project_session` / write gate |
| Registry | `registry.py` | One `RegisteredNativeTool` entry |
| Binding + audit execute | `langchain_bridge.py` | Usually unchanged; special-case only if handler needs extra kwargs (see `save_project_artifact`) |
| Loop / limits / duplicates | `tool_runtime/*` | Shared limits; don’t fork per tool |
| Progress SSE | `tool_runtime/progress.py` + frontend MCP card path | Same CUSTOM event; `tool_source=native` |
| Shared DTOs | `services/html_templates.py`, `artifact_templates.py`, `project_artifacts.py` | Prefer service functions over router copy-paste |

---

## Checklist: add a read native tool

Use this every time. Order matters.

### 1. Decide the contract

Write down before coding:

- **Display name** (snake_case, no `native__` prefix)
- **One-sentence description** (shown to the model)
- **Input fields** (never project/session IDs)
- **Output shape** (Pydantic model preferred)
- **Whether it mutates session defaults** (V1 catalog tools that “get” should not)
- **Whether guests may use it** (today: no native tools for guests)

### 2. Prefer a shared service

If the API already exposes the same data, put the mapper in `construction_os/services/` and call it from both the router and the capability. Do not invent a second DTO for the agent.

### 3. Implement the capability module

**File:** `construction_os/capabilities/<domain>.py` (new or existing family)

```python
class ListThingsInput(BaseModel):
    query: Optional[str] = None

class ListThingsOutput(BaseModel):
    things: list[dict[str, Any]] = Field(default_factory=list)

async def list_things(
    ctx: CapabilityRuntimeContext,
    inputs: ListThingsInput | None = None,
) -> ListThingsOutput:
    await require_project_session(ctx)
    ...
    return ListThingsOutput(things=...)
```

Patterns to copy:

- Catalog list + get: `skills.py`, `collections.py`, `output_templates.py`
- Discovery-only (no execute): `tools.py`
- Generate without save: `run_artifact_template` in `artifact_templates.py`

### 4. Register the tool

**File:** `construction_os/capabilities/registry.py`

1. Import the module.
2. Add a `RegisteredNativeTool` with `name`, `description`, `input_model`, `handler`.
3. Default `access="read"` / `performed_write=False`.

### 5. Wire context only if needed

If the handler needs new trusted fields, extend `CapabilityRuntimeContext` and populate them in `graphs/chat.py` when building the context. Keep tool args free of scope IDs.

### 6. Tests + docs

1. `tests/test_native_capabilities.py` — registry count/name assertions; behavior tests for gates/filters.
2. Update [catalog.md](./catalog.md) (and [native-chat-tools-v1.md](../../implementation/native-chat-tools-v1.md) if that snapshot is still maintained).
3. Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_native_capabilities.py -q
```

No frontend change is required for a read tool that only returns JSON to the model (existing tool-call cards show progress via the shared CUSTOM event).

---

## Checklist: add a write native tool

Same as read, plus:

1. Set `access="write"` and `performed_write=True` on the registry entry.
2. Add a **server-side gate** in `authz.py` (or reuse / extend an existing flag on `CapabilityRuntimeContext`).
3. Exclude the tool from `bindable_native_tools` when the gate is closed (see `save_project_artifact`).
4. Set the gate in `graphs/chat.py` from trusted user intent (or stronger auth), never from model-supplied booleans.
5. Define idempotency if retries are likely (Project Artifact pattern: key on domain record).
6. If the UI must refresh, document which React Query keys to invalidate (example: `QUERY_KEYS.projectArtifacts(projectId)`).

Do **not** enable arbitrary admin CRUD writes in V1 without a product design for approval / undo.

---

## Checklist: rename or split a catalog family

When agent confusion is the problem (e.g. HTML vs artifact templates):

1. Rename display names in the registry and capability module.
2. Keep shared services stable if the underlying resource is unchanged.
3. Update [catalog.md](./catalog.md) resource-family table.
4. Grep for old runtime names (`list_templates`, etc.) in tests and prompts.
5. Prefer clear pairs: `list_*` / `get_*` / optional `run_*` or `save_*`.

---

## Checklist: change execution policy

| Change | Where |
|--------|-------|
| Iteration / call / result size limits | `construction_os/mcp/limits.py` (shared with MCP) + env docs if user-facing |
| Duplicate rejection | `tool_runtime/execution.py` (`DuplicateCallGuard`) |
| Guest / native enable | `bindable_native_tools` + chat graph context build |
| Write intent heuristic | `graphs/chat_intent.py` (`requests_project_artifact_save`) |

Update [architecture.md](./architecture.md) when hard rules change.

---

## Checklist: expose the same capability over MCP server later

Native handlers are protocol-neutral on purpose. When Cos-as-MCP-server should expose a capability:

1. Keep the handler as the single implementation.
2. Add a thin MCP tool adapter that maps MCP args → handler inputs and injects a trusted server context (never trust client-supplied project scope without auth).
3. Do not copy business logic into `api/` or a second handler module.

Product MCP server docs: [mcp-integration.md](../../5-CONFIGURATION/mcp-integration.md).

---

## Debugging

| Symptom | Check |
|---------|-------|
| Tool missing from model | Guest chat? `enable_native_tools`? Registered name? Write gate closed for `save_*`? |
| Validation reject | Input model fields vs model args; no project IDs |
| Authz error | Session linked to project? `require_project_session` |
| Duplicate reject | Same tool + identical args twice in one turn |
| Empty MCP discovery | Wrong expectation — use `list_tools` for MCP; natives are automatic |
| UI card missing | Progress emit path / CUSTOM `mcp_tool_call` with `tool_source` |

---

## Doc update rule

When you ship a native tool change, update in the same PR:

1. [catalog.md](./catalog.md) — what exists
2. This file — only if the extension checklist or anti-patterns change
3. [architecture.md](./architecture.md) — only if layers / context fields / security rules change

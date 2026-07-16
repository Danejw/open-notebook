# Native tool catalog (Construction OS)

What native chat tools exist today, what they return, and how they differ from MCP tools.

**Related:** [architecture.md](./architecture.md) · [extending.md](./extending.md) · [implementation note](../../implementation/native-chat-tools-v1.md)

---

## Naming

| Layer | Example |
|-------|---------|
| Display / docs / audit `tool_name` | `get_project_context` |
| LangChain runtime name | `native__get_project_context` |

Prefix helper: `construction_os.capabilities.registry.runtime_name()`.

Native tools are **automatic** for project chat (non-guest). They are **not** listed by `list_tools` (that tool discovers external MCP tools only).

---

## Catalog (V1)

| Tool | Access | Module | Purpose |
|------|--------|--------|---------|
| `get_project_context` | read | `context.py` | Active project/session metadata, counts, explicit selections |
| `search_project_knowledge` | read | `retrieval.py` | Hybrid/vector evidence from project sources and Project Artifacts |
| `list_skills` | read | `skills.py` | Non-archived skill catalog (metadata) |
| `get_skill` | read | `skills.py` | Load `SKILL.md` or a supporting file (turn-only; no session persist) |
| `list_collections` | read | `collections.py` | Non-archived collection catalog + `use_when` |
| `get_collection` | read | `collections.py` | Load collection prompt block (turn-only) |
| `list_tools` | read | `tools.py` | **External/MCP tools only** — discovery ≠ execution |
| `get_tool` | read | `tools.py` | One MCP tool schema/metadata (no execute; no secrets) |
| `list_output_templates` | read | `output_templates.py` | HTML / structured output template metadata (no body) |
| `get_output_template` | read | `output_templates.py` | One HTML template with body + structure metadata |
| `list_artifact_templates` | read | `artifact_templates.py` | Artifact (prompt) template catalog + default attachments |
| `get_artifact_template` | read | `artifact_templates.py` | One artifact template with prompt + defaults (no execute) |
| `run_artifact_template` | read | `artifact_templates.py` | Execute artifact template → generated text (not saved) |
| `save_project_artifact` | write | `project_artifacts.py` | Persist a Project Artifact (gated) |

Source of truth for registration: `construction_os/capabilities/registry.py` (`NATIVE_TOOL_NAMES`).

---

## Resource families

Agents should treat these as distinct catalogs:

| Family | List | Get | Execute / write |
|--------|------|-----|-----------------|
| Skills | `list_skills` | `get_skill` | — (prompt injection via session / ephemeral) |
| Collections | `list_collections` | `get_collection` | — |
| External MCP tools | `list_tools` | `get_tool` | Allowlisted MCP execute path (not these tools) |
| Output templates (HTML) | `list_output_templates` | `get_output_template` | Session `html_template_id` fills the system prompt |
| Artifact templates (prompts) | `list_artifact_templates` | `get_artifact_template` | `run_artifact_template` → optional `save_project_artifact` |

---

## Important behaviors

### Trusted IDs

Handlers never accept `project_id` / `session_id` from the model. Those come from `CapabilityRuntimeContext` built in `graphs/chat.py`.

### Turn-only loads

`get_skill` / `get_collection` may append to `ephemeral_skill_ids` / `ephemeral_collection_ids` on the runtime context. They do **not** call session persistence helpers.

`get_output_template` / `get_artifact_template` / `run_artifact_template` also do **not** persist session defaults.

### `list_tools` vs native tools

- `list_tools` / `get_tool` = MCP discovery only.
- Native tools are always bound when `enable_native_tools` is true and the chat is not a guest.
- MCP execution still requires manual selection + allowlist (`mcp_tool_ids`).

### Write gate (`save_project_artifact`)

Bound only when `allow_project_artifact_save` is true (server sets this from `requests_project_artifact_save(user_message)`). Handler also re-checks the gate. Idempotency key prefers tool argument, then tool-call id.

---

## Deferred (not in V1)

Skill/collection/template/MCP admin CRUD via chat, source upload, web search, deep research, URL ingestion, KG rebuild, deletions, queue admin.

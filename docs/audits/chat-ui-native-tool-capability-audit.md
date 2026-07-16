# Construction OS Chat UI Native Tool Capability Audit

## Executive Summary

- Meaningful capabilities found: `19`
- Ready for direct exposure: `5`
- Adapter required: `6`
- Service extraction required: `4`
- Significant work required: `2`
- Should not be exposed: `2`
- Recommended initial chat tools: `8`
- Largest technical blocker: the application has only instance-wide password auth and no per-project authorization or approval layer for internal write capabilities (`api/main.py`, `api/auth.py`).
- Overall implementation difficulty: `Large`
- Recommended first implementation step: extract a small server-side capability layer for project context, retrieval, capability catalogs, artifact execution, and artifact/document draft creation, then bind native chat tools to that layer instead of calling routers or React state directly.

The codebase already contains a substantial amount of reusable capability logic: retrieval/search, chat session orchestration, skill and collection catalogs, artifact template execution, project artifact persistence, HTML template/document generation, knowledge graph reads, and allowlisted MCP read-tool execution. The strongest existing pattern is server-side domain/service logic exposed through API routers and reused by LangGraph chat graphs.

The main gaps are not missing features, but missing boundaries. Manual selections are currently session-bound UI state plus request overrides, and autonomous choices would overwrite those selections if reused naively. Internal write paths also lack approval, idempotency, structured audit logging, and project-level authorization. Native chat tools are viable, but only if they call a shared capability layer that preserves explicit user selections and separates `read`, `draft-write`, and `approved-write` behavior.

## Recommended Direction

Implement native chat tools as thin adapters over a protocol-neutral server capability layer:

```text
construction_os/capabilities/
  registry.py
  authz.py
  context.py
  retrieval.py
  skills.py
  collections.py
  artifacts.py
  documents.py
  knowledge.py
  audit.py
```

Recommended design principles:

- Keep model-facing tools narrow and task-oriented, not CRUD-shaped.
- Reuse existing domain/services/graphs; do not duplicate router logic in tool handlers.
- Preserve explicit user selections as higher precedence than autonomous agent additions.
- Treat search/read tools as automatic, but route writes through draft creation or approval.
- Reuse the same capability contracts later for MCP exposure; keep MCP transport concerns outside the internal chat path.

## Current Architecture

Construction OS already has the three layers needed for native tools, but they are unevenly reusable:

- Frontend UI and state live in `frontend/src`, with chat orchestration centralized in `useChatRuntime()` and selection state in `useChatSkillSelection()` (`frontend/src/lib/hooks/useChatRuntime.ts`, `frontend/src/lib/hooks/useChatSkillSelection.ts`).
- HTTP routes live in `api/routers/*.py`, often calling either a thin service layer (`api/skills_service.py`, `api/collections_service.py`, `api/mcp_service.py`) or domain/graph modules directly (`api/routers/chat.py`, `api/routers/artifact_templates.py`, `api/routers/project_artifacts.py`).
- Reusable backend behavior lives mostly in `construction_os/domain/`, `construction_os/graphs/`, `construction_os/collections/`, `construction_os/skills/`, and `construction_os/mcp/`.

Important architectural facts:

- Global auth is enforced by `PasswordAuthMiddleware`, not per-project authorization (`api/auth.py`).
- Chat flows use AG-UI + LangGraph, not raw REST polling, for active turns (`api/ag_ui_agents.py`, `construction_os/graphs/ag_ui_runtime.py`).
- Project chat and source chat already load selected skills and collections into the system prompt and can bind allowlisted MCP tools (`construction_os/graphs/chat.py`, `construction_os/graphs/source_chat.py`, `construction_os/mcp/chat_loop.py`).
- The codebase already models remote MCP tools and audits their execution, but only `read`-risk MCP tools are executable automatically (`construction_os/mcp/execution.py`, `construction_os/mcp/allowlist.py`).

## Existing Agent and Chat Implementation

### Confirmed existing implementation

- Project chat sessions and turns:
  - `api/routers/chat.py`
  - `create_session()`, `get_session()`, `update_session()`, `execute_chat()`, `build_context()`, `get_chat_suggestions()`
  - Server-side, reusable only in parts. Session persistence and forwarded props are route-level orchestration.
- Source chat sessions and turns:
  - `api/routers/source_chat.py`
  - `create_source_chat_session()`, `send_message_to_source_chat()`
  - Similar to project chat, but tied to a source-scoped graph.
- Shared AG-UI runtime:
  - `api/ag_ui_agents.py`
  - `construction_os/graphs/ag_ui_runtime.py`
  - `build_run_input()`, `ag_ui_streaming_response()`
  - This is protocol-neutral enough to reuse for native chat tools.
- Project chat graph:
  - `construction_os/graphs/chat.py`
  - `loading_skills()`, `loading_collections()`, `retrieving_context()`, `generating()`
  - Loads skills/collections, builds project relevance context, and optionally executes MCP tools.
- Source chat graph:
  - `construction_os/graphs/source_chat.py`
  - Similar graph, but source-scoped context is built with `ContextBuilder`.
- Ask/search agent:
  - `construction_os/graphs/ask.py`
  - Multi-query planning + retrieval + final synthesis, including graph-aware retrieval mode and persisted `query_run_id`.

### Coupling concerns

- Chat session update semantics are stateful and mutable: `resolve_session_skill_ids()`, `resolve_session_collection_ids()`, and `resolve_session_html_template_id()` update session defaults from per-message request overrides (`construction_os/utils/chat_session.py`).
- This is correct for manual UI actions, but it is too aggressive for autonomous agent selection: an internal tool should be able to add temporary supporting capabilities without silently overwriting user intent.
- Chat selection persistence is split between server session fields and client-only transient MCP tool selection. `skill_ids`, `collection_ids`, and `html_template_id` persist in `ChatSession`; `selectedMcpToolIds` do not (`frontend/src/lib/hooks/useChatSkillSelection.ts`).

## Existing Capability Inventory

### 1. Project and source chat sessions

- Implementation:
  - `api/routers/chat.py`
  - `api/routers/source_chat.py`
  - `construction_os/domain/project.py` (`ChatSession`)
- What it does:
  - Creates sessions, persists chat defaults, streams turns, loads history, truncates and resends edited turns.
- Dependencies:
  - LangGraph checkpointer, AG-UI runtime, `Project`, `Source`, `ChatSession`, `chat_queue_service`.
- Server/client:
  - Server capability with frontend adapters in `useProjectChat()` and `useSourceChat()`.
- Reusable:
  - Partially. Session CRUD is reusable; execution logic is still route/graph orchestration.
- Validation:
  - Pydantic request models in `api/routers/chat.py` and `api/routers/source_chat.py`.
- Authorization:
  - Only global password auth; guest-key session scoping exists for shared chat (`_assert_session_guest_access()`).
- Tests:
  - `tests/test_chat_guest_access.py`, `tests/test_chat_session_utils.py`, `tests/test_graphs.py`.
- Concerns:
  - No project-level auth or explicit approval logic.

### 2. Query-scoped project retrieval

- Implementation:
  - `construction_os/graphs/chat_context.py`
  - `build_relevance_context()`, `eligible_source_ids()`, `eligible_note_ids()`, `estimate_preview_tokens()`
- What it does:
  - Converts UI selection pools into a capped relevance-ranked evidence context using retrieval.
- Dependencies:
  - `construction_os.retrieval.retrieve`, `Note`, token counting.
- Server/client:
  - Server-side reusable.
- Reusable:
  - Yes; this is one of the strongest candidates for direct native tool exposure.
- Validation:
  - Input is implicit today; a tool adapter should validate project ID and candidate ID lists.
- Authorization:
  - No project-level auth.
- Tests:
  - `tests/test_chat_context.py`.
- Concerns:
  - Currently hidden inside the chat graph rather than exposed as a first-class service.

### 3. Project search and ask

- Implementation:
  - `api/routers/search.py`
  - `construction_os/domain/project.py` (`text_search()`, `vector_search()`)
  - `construction_os/graphs/ask.py`
- What it does:
  - Text/vector/hybrid search and graph-aware multi-step answer generation with `query_run_id`.
- Dependencies:
  - Embedding model configuration, retrieval bundle, graph projection persistence.
- Server/client:
  - Server-side.
- Reusable:
  - Search functions are reusable; `/search/ask` is route/agent orchestration but still cleanly bounded.
- Validation:
  - Pydantic `SearchRequest`, `AskRequest`.
- Authorization:
  - No project-level auth; project filtering is implemented technically, not by ownership.
- Tests:
  - `tests/test_search_api.py`, `tests/test_project_scope_filter.py`, `tests/test_graph_projection.py`.
- Concerns:
  - Search results are raw dicts; a tool adapter should normalize outputs and confidence semantics.

### 4. Skills catalog, storage, validation, import/export

- Implementation:
  - `api/skills_service.py`
  - `construction_os/domain/skill.py`
  - `construction_os/skills/loader.py`
  - `construction_os/skills/validation.py`
  - `api/routers/skills.py`
- What it does:
  - CRUD, per-file package editing, validation, import/export, SKILL.md loading, and supporting file reads.
- Dependencies:
  - `Skill`, `SkillFile`, zip I/O, standard parser/validator.
- Server/client:
  - Server-side with frontend CRUD pages and picker.
- Reusable:
  - Yes. `skills_service` and `skills.loader` already form a usable capability layer.
- Validation:
  - Strong. `validate_skill_files()` and path normalization enforce package rules.
- Authorization:
  - Only global password auth.
- Tests:
  - `tests/test_skills_standard.py`.
- Concerns:
  - No semantic search/recommendation, no version history beyond a metadata field, no association graph beyond artifact/session references.

### 5. Collections catalog, storage, validation, context injection

- Implementation:
  - `api/collections_service.py`
  - `construction_os/domain/collection.py`
  - `construction_os/collections/loader.py`
  - `construction_os/collections/validation.py`
  - `api/routers/collections.py`
- What it does:
  - CRUD, item replacement, duplication, archive/export/import, manifest generation, and prompt injection of curated URL references.
- Dependencies:
  - `Collection`, `CollectionItem`, markdown/zip helpers.
- Server/client:
  - Server-side with frontend library/editor and picker.
- Reusable:
  - Yes, though no dedicated search service exists.
- Validation:
  - Present via `validate_collection_record()`.
- Authorization:
  - Only global password auth.
- Tests:
  - `tests/test_collections_loader.py`, `tests/test_collections_standard.py`.
- Concerns:
  - No project/skill/tool association graph, no semantic discovery, no chat-session item subset selection.

### 6. Artifact templates and chat defaults

- Implementation:
  - `api/routers/artifact_templates.py`
  - `construction_os/domain/artifact.py`
  - `construction_os/graphs/artifact.py`
  - `frontend/src/components/chat/ChatDefaultsPickerRow.tsx`
- What it does:
  - Stores prompt templates that can carry default `skill_ids`, `collection_ids`, `mcp_tool_ids`, and `html_template_id`; executes templates against input text.
- Dependencies:
  - `ArtifactTemplate`, artifact graph, model registry.
- Server/client:
  - Server capability with frontend editor/playground.
- Reusable:
  - Execution is reusable; CRUD is route-level but simple.
- Validation:
  - Pydantic request models; no deeper execution approval.
- Authorization:
  - Only global password auth.
- Tests:
  - Artifact execution covered indirectly in graph/API tests; project artifact tests exist in `tests/test_notes_api.py`.
- Concerns:
  - Execution returns output only; there is no dedicated draft-save service tying execution, provenance, and save together.

### 7. Project artifacts

- Implementation:
  - `api/routers/project_artifacts.py`
  - `construction_os/domain/project_artifact.py`
- What it does:
  - Create/update/list/read/delete project outputs, auto-title AI/generated artifacts, export generated artifacts to PDF, ingest generated/AI artifacts as sources.
- Dependencies:
  - `ProjectArtifact`, prompt graph, promotion service, embed command.
- Server/client:
  - Server-side with UI editors/viewers.
- Reusable:
  - Mostly yes, but title generation and save are route-driven.
- Validation:
  - Strong artifact kind normalization.
- Authorization:
  - Only global password auth.
- Tests:
  - `tests/test_notes_api.py`, `tests/test_promotion_api.py`.
- Concerns:
  - Save is immediate, not draft/approval-oriented; provenance is coarse (`manual|ai|generated` only).

### 8. HTML templates and documents

- Implementation:
  - `api/routers/html_documents.py`
  - `construction_os/domain/html_document.py`
  - `construction_os/utils/html_spans.py`
  - `construction_os/utils/html_pdf_export.py`
- What it does:
  - Store HTML templates, create project-scoped document snapshots, patch spans, duplicate scenarios, preview HTML, render/export PDF.
- Dependencies:
  - `HtmlTemplate`, `Document`, media inlining, span-structure validation.
- Server/client:
  - Server-side with UI pages.
- Reusable:
  - Yes, especially `create_project_document`, `update_document`, and `render_html_as_pdf`.
- Validation:
  - HTML body checks and optional structure-preservation guard.
- Authorization:
  - Only global password auth.
- Tests:
  - `tests/test_html_documents_api.py`, `tests/test_html_pdf_export.py`, `tests/test_html_spans.py`.
- Concerns:
  - Writes are immediate; tool exposure should use draft semantics or explicit approval.

### 9. Knowledge graph extraction and read APIs

- Implementation:
  - `api/routers/knowledge_graph.py`
  - `api/routers/knowledge_graph_viz.py`
  - `construction_os/domain/knowledge_graph.py`
  - `construction_os/knowledge/graph_projection.py`
- What it does:
  - Lists extractors, starts extraction jobs, reads source/project entity views, path and overview data, rebuilds/link jobs.
- Dependencies:
  - Extraction pipeline, project linker, graph projection persistence.
- Server/client:
  - Server-side.
- Reusable:
  - Read/query functions are good candidates; rebuild/link are administrative.
- Validation:
  - Request models and explicit extractor validation exist.
- Authorization:
  - Only global password auth.
- Tests:
  - `tests/test_knowledge_graph.py`, `tests/test_graph_projection.py`.
- Concerns:
  - Extraction/rebuild are potentially expensive and should not be autonomous initial tools.

### 10. MCP connection management and read-tool execution

- Implementation:
  - `api/mcp_service.py`
  - `api/routers/mcp.py`
  - `construction_os/domain/mcp.py`
  - `construction_os/mcp/allowlist.py`
  - `construction_os/mcp/execution.py`
  - `construction_os/mcp/chat_loop.py`
- What it does:
  - Stores MCP connections and discovered tools, surfaces selectable tools, and executes only read-risk allowlisted tools during chat.
- Dependencies:
  - MCP client, transport, schema validation, audit logging.
- Server/client:
  - Server-side plus frontend admin pages and picker.
- Reusable:
  - Yes for selection and audited execution.
- Validation:
  - Good. Tool args are schema validated, duplicate calls are blocked, unavailable/non-read tools are rejected.
- Authorization:
  - Only global password auth; no project scoping.
- Tests:
  - `tests/test_mcp_chat_loop.py`, `tests/test_mcp_allowlist.py`, `tests/test_mcp_schema_validate.py`, `tests/test_mcp_progress.py`, `tests/test_mcp_transport.py`, `tests/test_mcp_discovery.py`, `tests/test_mcp_url_safety.py`.
- Concerns:
  - This is for remote MCP servers, not the internal Construction OS capability layer.

### 11. Chat queue and background execution

- Implementation:
  - `api/routers/chat_queue.py`
  - `api/chat_queue_service.py`
  - `construction_os/domain/chat_queue.py`
  - `construction_os/chat/queue_runner.py`
- What it does:
  - Persistent per-session prompt queue with edit/retry/reorder/pause/resume and worker execution.
- Dependencies:
  - Session graph execution, strict MCP tool validation, queue repository.
- Server/client:
  - Server capability with frontend panel UI.
- Reusable:
  - Queue service is reusable, but it is not a good first native tool target.
- Validation:
  - Stronger than many other areas; queue tool selections use strict allowlist validation.
- Authorization:
  - Only global password auth.
- Tests:
  - `tests/test_chat_queue_api.py`, `tests/test_chat_queue_domain.py`, `tests/test_chat_queue_worker.py`, `tests/test_chat_queue_worker_safety.py`.
- Concerns:
  - Operationally useful, but too much orchestration surface for initial agent tool exposure.

## Manual Selection and Context Precedence

### Confirmed current behavior

- Session-scoped persisted manual selections:
  - `ChatSession.skill_ids`
  - `ChatSession.collection_ids`
  - `ChatSession.html_template_id`
  - Stored server-side in `construction_os/domain/project.py`.
- Transient client-only tool selections:
  - `selectedMcpToolIds` in `useChatSkillSelection()`
  - Not persisted to `ChatSession` (`frontend/src/lib/hooks/useChatSkillSelection.ts`).
- Frontend chat selector UI:
  - `ChatComposer` renders `SkillPicker`, `ToolPicker`, `CollectionPicker`, `TemplatePicker`
  - `frontend/src/components/source/ChatComposer.tsx`
- Selection persistence logic:
  - `useChatSkillSelection()` persists skill/collection/template changes immediately to the current session via `persistSession()`.
- Request override semantics:
  - `resolve_session_skill_ids()`, `resolve_session_collection_ids()`, and `resolve_session_html_template_id()` mutate the session when request-level overrides are present (`construction_os/utils/chat_session.py`).
- Artifact default injection:
  - `useProjectChat.applyArtifactDefaults()` merges artifact skill/tool/collection defaults into current selections and overwrites the template if the artifact has one (`frontend/src/lib/hooks/useProjectChat.ts`).

### Current implicit precedence

Observed precedence today is roughly:

1. Explicit per-message override, if sent in the request
2. Current session selection
3. Artifact-click defaults merged into current selection on the client
4. System default behavior

This is close to the desired model, but it is unsafe for autonomous agent augmentation because per-message overrides become new session defaults.

### Recommended precedence model

1. Explicit user selection
2. Current artifact, project, or chat configuration explicitly chosen by user
3. Agent-selected supporting capabilities for this turn only
4. Default system behavior

Required technical changes:

- Add a distinction between:
  - `explicit_skill_ids`, `explicit_collection_ids`, `explicit_html_template_id`, `explicit_mcp_tool_ids`
  - `ephemeral_agent_*` additions for one turn only
- Do not let autonomous tool selection call the same session-persistence path used by manual UI picks.
- Pass agent-added supporting capabilities in forwarded props or tool-runtime context only.
- Keep artifact defaults additive unless the user explicitly accepts a replacement.

## Capability Readiness Matrix

| Capability | Domain | Current implementation | File references | Readiness | Access type | Approval | Recommended chat tool | Priority | Effort |
| ---------- | ------ | ---------------------- | --------------- | --------- | ----------- | -------- | --------------------- | -------- | ------ |
| Project relevance retrieval | Retrieval | Query-scoped evidence assembly from selected pools | `construction_os/graphs/chat_context.py`, `construction_os/graphs/chat.py` | Adapter Required | `read` | No | `search_project_knowledge` | High | Small |
| Search API | Retrieval | Text/vector/hybrid project search | `api/routers/search.py`, `construction_os/domain/project.py` | Ready | `read` | No | `search_project_knowledge` | High | Small |
| Ask graph | Retrieval | Multi-step evidence synthesis with graph mode | `construction_os/graphs/ask.py`, `api/routers/search.py` | Adapter Required | `read` | No | `answer_project_question` | Medium | Medium |
| Skills catalog/read | Skills | CRUD, catalog, file loading, validation | `api/skills_service.py`, `construction_os/skills/loader.py`, `api/routers/skills.py` | Ready | `read` / `draft-write` | Writes yes | `list_skills`, `get_skill` | Medium | Small |
| Skill creation/update | Skills | CRUD and per-file editing | `api/skills_service.py`, `api/routers/skills.py` | Adapter Required | `draft-write` | Yes | `create_skill_draft` | Low | Medium |
| Collections catalog/read | Collections | CRUD, item lists, manifest/context loading | `api/collections_service.py`, `construction_os/collections/loader.py` | Ready | `read` / `draft-write` | Writes yes | `list_collections`, `get_collection` | Medium | Small |
| Collection mutation | Collections | Replace items, duplicate, archive, import/export | `api/collections_service.py`, `api/routers/collections.py` | Adapter Required | `draft-write` | Yes | `create_collection_draft` | Low | Medium |
| Artifact templates | Artifacts | CRUD + default skill/tool/collection/template attachments | `api/routers/artifact_templates.py`, `construction_os/domain/artifact.py` | Adapter Required | `read` / `approved-write` | Writes yes | `list_artifact_templates`, `get_artifact_template` | High | Small |
| Artifact execution | Artifacts | Prompt transform with selected model | `api/routers/artifact_templates.py`, `construction_os/graphs/artifact.py` | Adapter Required | `draft-write` | Usually yes | `run_artifact_template_draft` | High | Medium |
| Project artifact CRUD | Artifacts | Save/read/update/export/ingest artifact outputs | `api/routers/project_artifacts.py`, `construction_os/domain/project_artifact.py` | Adapter Required | `read` / `draft-write` / `approved-write` | Yes | `create_project_artifact_draft`, `get_project_artifact` | High | Medium |
| HTML template catalog/read | Templates | HTML template CRUD | `api/routers/html_documents.py`, `construction_os/domain/html_document.py` | Ready | `read` | No | `list_html_templates` | Medium | Small |
| HTML document creation/update | Templates/Outputs | Create document snapshots and patch HTML spans | `api/routers/html_documents.py` | Adapter Required | `draft-write` / `approved-write` | Yes | `create_project_document_draft` | Medium | Medium |
| HTML to PDF render/export | Outputs | Render chat/template HTML to PDF | `api/routers/html_documents.py`, `construction_os/utils/html_pdf_export.py` | Ready | `read` | No | `render_output_pdf` | Medium | Small |
| Knowledge graph read | Knowledge | Entity/detail/path/overview queries | `api/routers/knowledge_graph.py`, `api/routers/knowledge_graph_viz.py` | Adapter Required | `read` | No | `get_related_entities` | Medium | Medium |
| Knowledge extraction/rebuild | Knowledge | Queue extract/rebuild/link jobs | `api/routers/knowledge_graph.py` | Do Not Expose | `administrative` | Yes | None | Low | Medium |
| MCP read tool execution | Tools | Allowlisted audited read-only remote tool calls | `construction_os/mcp/execution.py`, `construction_os/mcp/chat_loop.py` | Ready | `read` | No | Existing chat MCP path | Medium | Small |
| MCP connection administration | Tools/Admin | Create/test/sync/delete connections | `api/mcp_service.py`, `api/routers/mcp.py` | Do Not Expose | `administrative` | Yes | None | Low | Small |
| Session selection persistence | Chat config | Persist skill/collection/template defaults to sessions | `frontend/src/lib/hooks/useChatSkillSelection.ts`, `construction_os/utils/chat_session.py` | Service Extraction Required | `approved-write` | Yes | `update_chat_defaults` | Medium | Medium |
| Queue management | Automation | Queue, worker, edit/retry/reorder | `api/chat_queue_service.py`, `construction_os/chat/queue_runner.py` | Service Extraction Required | `approved-write` / `administrative` | Yes | Later only | Low | Large |

## Proposed Initial Chat Toolset

Recommended first release: `8` tools.

| Tool | Purpose | Existing service | Access type | Approval | Refactor needed | Priority | Effort |
| ---- | ------- | ---------------- | ----------- | -------- | --------------- | -------- | ------ |
| `get_project_context` | Return active project metadata, source/artifact counts, and current explicit chat defaults | `Project`, `ChatSession`, `session_record_fields()` | `read` | No | Thin adapter | High | Small |
| `search_project_knowledge` | Search project-scoped sources/artifacts using text/vector/hybrid retrieval | `text_search()`, `vector_search()`, `build_relevance_context()` | `read` | No | Thin adapter | High | Small |
| `answer_project_question` | Run multi-step retrieval synthesis for harder questions | `construction_os/graphs/ask.py` | `read` | No | Thin adapter | Medium | Medium |
| `list_skills` | List available non-archived skills for selection/recommendation | `get_skill_catalog()` | `read` | No | None | Medium | Small |
| `list_collections` | List available non-archived collections and counts | `get_collection_catalog()` | `read` | No | None | Medium | Small |
| `list_artifact_templates` | Show reusable artifact templates and their default capability attachments | `ArtifactTemplate.get_all()` / route mapper | `read` | No | Thin adapter | High | Small |
| `run_artifact_template_draft` | Execute an artifact template and return draft output without saving | `artifact_graph`, `ArtifactTemplate`, `Model` | `draft-write` | Usually implicit okay; save separate | Adapter | High | Medium |
| `create_project_artifact_draft` | Save agent output as a draft project artifact after user approval | `ProjectArtifact`, title generation helper | `approved-write` | Yes | Adapter + approval wrapper | High | Medium |

Tools intentionally deferred from v1:

- `get_skill`
- `get_collection`
- `list_html_templates`
- `create_project_document_draft`
- `render_output_pdf`
- `get_related_entities`

These are useful, but less critical than retrieval + draft output flow.

## Detailed Tool Specifications

### Tool: `get_project_context`

**Purpose**

Return the active project’s metadata, available source/artifact counts, and current explicit chat defaults so the agent can reason about scope without scraping the UI.

**Agent usage conditions**

Use at the start of a project-scoped conversation, or when the agent needs to understand current project/session constraints before other tools.

**Do not use when**

Do not use for actual evidence retrieval; use `search_project_knowledge` instead.

**Access classification**

`read`

**Approval behavior**

No approval required.

**Proposed input schema**

```json
{
  "project_id": "project:123",
  "session_id": "chat_session:456"
}
```

**Proposed output schema**

```json
{
  "project": {
    "id": "project:123",
    "name": "Kailua Restaurant TI",
    "description": "..."
  },
  "counts": {
    "sources": 12,
    "artifacts": 5
  },
  "chat_defaults": {
    "skill_ids": ["skill:a"],
    "collection_ids": ["collection:b"],
    "html_template_id": "html_template:c"
  }
}
```

**Current implementation**

- `construction_os/domain/project.py` (`Project.get_sources()`, `Project.get_artifacts()`)
- `construction_os/utils/chat_session.py` (`session_record_fields()`)
- `api/routers/chat.py` (`get_session()`)

**Required adapter or extraction**

Thin adapter service that reads project + session in one place without returning full thread history.

**Authorization requirements**

Must verify the requesting session/project pair belongs to the current authenticated scope once project auth exists.

**UI behavior**

Silent background read; optionally shown in activity log.

**Error and failure behavior**

Return structured `not_found` or `access_denied`; never fall back to cross-project reads.

**Test requirements**

Adapter unit test plus integration test for missing project/session.

**Future MCP compatibility**

Same schema can back a future MCP `get_project_context` tool directly.

**Priority**

High

**Estimated effort**

Small

### Tool: `search_project_knowledge`

**Purpose**

Search within project knowledge and return compact evidence with provenance.

**Agent usage conditions**

Use for fact-finding, citation gathering, finding related sources/artifacts, and retrieving scoped evidence for the current project.

**Do not use when**

Do not use when the question is purely about available capabilities, chat configuration, or UI state.

**Access classification**

`read`

**Approval behavior**

No approval required.

**Proposed input schema**

```json
{
  "project_id": "project:123",
  "query": "roof waterproofing warranty requirements",
  "mode": "auto",
  "limit": 8,
  "source_ids": ["source:1", "source:2"],
  "artifact_ids": ["note:4"]
}
```

> `artifact_ids` are Project Artifact record IDs. Values still use the opaque `note:` prefix today.

**Proposed output schema**

```json
{
  "results": [
    {
      "id": "source:1",
      "title": "Division 07 Spec",
      "excerpt": "...",
      "score": 0.82,
      "kind": "source"
    }
  ],
  "retrieval": {
    "mode_used": "hybrid",
    "source_count": 3,
    "artifact_count": 1
  }
}
```

**Current implementation**

- `construction_os/domain/project.py` (`text_search()`, `vector_search()`)
- `construction_os/graphs/chat_context.py` (`build_relevance_context()`)
- `api/routers/search.py`

**Required adapter or extraction**

Thin adapter to normalize outputs and unify raw search with chat-context evidence formatting.

**Authorization requirements**

Must enforce project scoping strictly.

**UI behavior**

Silent background retrieval, with optional citations panel.

**Error and failure behavior**

Surface embedding-model-missing vs retrieval-empty distinctly.

**Test requirements**

Project-scope filtering, no-cross-project regression, and output schema tests.

**Future MCP compatibility**

Directly reusable.

**Priority**

High

**Estimated effort**

Small

### Tool: `answer_project_question`

**Purpose**

Run the existing Ask workflow for harder multi-step synthesis questions.

**Agent usage conditions**

Use when simple search results are insufficient and a composed answer with multiple evidence passes is needed.

**Do not use when**

Do not use for simple keyword lookups or when low-latency retrieval is enough.

**Access classification**

`read`

**Approval behavior**

No approval required.

**Proposed input schema**

```json
{
  "project_id": "project:123",
  "question": "What contract requirements could delay rough-in approval?",
  "retrieval_mode": "graph"
}
```

**Proposed output schema**

```json
{
  "answer": "...",
  "query_run_id": "kg_query_run:1",
  "evidence_summary": {
    "retrieval_mode": "graph"
  }
}
```

**Current implementation**

- `construction_os/graphs/ask.py`
- `api/routers/search.py`

**Required adapter or extraction**

Thin adapter to choose models from configured defaults rather than exposing all three model IDs to the agent.

**Authorization requirements**

Same project-scope restrictions as search.

**UI behavior**

Show as a longer-running step with progress.

**Error and failure behavior**

If retrieval fails, return actionable failure text rather than empty answer.

**Test requirements**

Adapter tests for default model resolution and project scope.

**Future MCP compatibility**

Reusable with the same input/output contract.

**Priority**

Medium

**Estimated effort**

Medium

### Tool: `list_skills`

**Purpose**

Return available skills for recommendation or user confirmation.

**Agent usage conditions**

Use when the conversation clearly benefits from named skill packages or when explaining available skill options.

**Do not use when**

Do not use if the session already has explicit selected skills and the task does not require alternatives.

**Access classification**

`read`

**Approval behavior**

No approval required.

**Proposed input schema**

```json
{
  "query": "plumbing",
  "limit": 20
}
```

**Proposed output schema**

```json
{
  "skills": [
    {
      "id": "skill:1",
      "name": "plumbing-review",
      "description": "Review plumbing drawings...",
      "tags": ["plumbing"],
      "status": "active"
    }
  ]
}
```

**Current implementation**

- `construction_os/skills/loader.py` (`get_skill_catalog()`)
- `api/routers/skills.py` (`skills_catalog()`)

**Required adapter or extraction**

Thin server-side filter/search adapter; current API lists only, it does not search.

**Authorization requirements**

Instance-wide read unless future visibility scopes are enforced.

**UI behavior**

Could drive a confirmation chip list if the user wants to attach one.

**Error and failure behavior**

Empty list on no matches, not an error.

**Test requirements**

Catalog filtering tests.

**Future MCP compatibility**

Directly reusable.

**Priority**

Medium

**Estimated effort**

Small

### Tool: `list_collections`

**Purpose**

Return curated reference collections available to the current instance.

**Agent usage conditions**

Use when the task would benefit from curated external references or standards collections.

**Do not use when**

Do not use if explicit collections are already selected and sufficient.

**Access classification**

`read`

**Approval behavior**

No approval required.

**Proposed input schema**

```json
{
  "query": "hawaii code",
  "limit": 20
}
```

**Proposed output schema**

```json
{
  "collections": [
    {
      "id": "collection:1",
      "name": "Hawaii Sources",
      "description": "Official sources",
      "item_count": 18
    }
  ]
}
```

**Current implementation**

- `construction_os/collections/loader.py` (`get_collection_catalog()`)
- `api/routers/collections.py` (`collections_catalog()`)

**Required adapter or extraction**

Thin server-side filter/search adapter; current API lists only.

**Authorization requirements**

Instance-wide read unless visibility expands.

**UI behavior**

Silent background read or recommendation list.

**Error and failure behavior**

Return empty list for no matches.

**Test requirements**

Catalog filter tests.

**Future MCP compatibility**

Directly reusable.

**Priority**

Medium

**Estimated effort**

Small

### Tool: `list_artifact_templates`

**Purpose**

Show reusable artifact templates and the capability defaults they carry.

**Agent usage conditions**

Use when the user wants a structured output or when the agent needs to choose from known artifact transformations.

**Do not use when**

Do not use when the task is just fact retrieval with no output-generation need.

**Access classification**

`read`

**Approval behavior**

No approval required.

**Proposed input schema**

```json
{
  "lifecycle_phase": "bidding",
  "query": "scope summary"
}
```

**Proposed output schema**

```json
{
  "artifacts": [
    {
      "id": "artifact:1",
      "title": "Bid Scope Summary",
      "description": "...",
      "skill_ids": ["skill:a"],
      "collection_ids": ["collection:b"],
      "mcp_tool_ids": ["mcp_tool:c"],
      "html_template_id": "html_template:d"
    }
  ]
}
```

**Current implementation**

- `api/routers/artifact_templates.py`
- `construction_os/domain/artifact.py`

**Required adapter or extraction**

Thin read adapter; current route already returns nearly the right shape.

**Authorization requirements**

Same instance-level auth caveat.

**UI behavior**

Can drive explicit user approval to apply defaults before executing.

**Error and failure behavior**

Empty result or not-found.

**Test requirements**

Adapter tests around phase/query filtering.

**Future MCP compatibility**

Straightforward.

**Priority**

High

**Estimated effort**

Small

### Tool: `run_artifact_template_draft`

**Purpose**

Execute an artifact template against provided input and return an unsaved draft output.

**Agent usage conditions**

Use when the user requests a structured transform or document-like artifact but has not yet asked to save it.

**Do not use when**

Do not use to persist results automatically.

**Access classification**

`draft-write`

**Approval behavior**

Execution can be automatic; saving the result should require a separate explicit save/approval tool.

**Proposed input schema**

```json
{
  "artifact_id": "artifact:1",
  "input_text": "source excerpts or summarized context",
  "model_id": "model:default_artifact"
}
```

**Proposed output schema**

```json
{
  "draft_output": "...",
  "artifact": {
    "id": "artifact:1",
    "title": "Bid Scope Summary"
  }
}
```

**Current implementation**

- `api/routers/artifact_templates.py` (`execute_artifact_template()`)
- `construction_os/graphs/artifact.py`

**Required adapter or extraction**

Adapter should resolve the default model and optionally capture provenance metadata for later save.

**Authorization requirements**

No extra authorization beyond project scope and model availability.

**UI behavior**

Render draft inline with actions like `Save as artifact` or `Render with template`.

**Error and failure behavior**

Return model/template not found and model execution errors distinctly.

**Test requirements**

Adapter tests for default model resolution and unsaved draft response.

**Future MCP compatibility**

Directly reusable.

**Priority**

High

**Estimated effort**

Medium

### Tool: `create_project_artifact_draft`

**Purpose**

Persist an approved AI result into project artifacts without exposing raw CRUD.

**Agent usage conditions**

Use only after the user asks to save a result, or explicitly approves a save suggestion.

**Do not use when**

Do not use automatically after generation.

**Access classification**

`approved-write`

**Approval behavior**

Explicit user approval required.

**Proposed input schema**

```json
{
  "project_id": "project:123",
  "title": "Optional title",
  "content": "Generated summary...",
  "artifact_kind": "ai"
}
```

**Proposed output schema**

```json
{
  "project_artifact": {
    "id": "note:123",
    "title": "Generated title",
    "artifact_kind": "ai"
  }
}
```

> **ID convention:** Project Artifact record IDs currently keep the Surreal table prefix `note:` (for example `note:123`). Treat `note:` as an opaque Project Artifact identifier until a future table/ID rewrite. Do not invent `project_artifact:` IDs in tools or clients.

**Current implementation**

- `api/routers/project_artifacts.py` (`create_project_artifact()`)
- `construction_os/domain/project_artifact.py`

**Required adapter or extraction**

Adapter should wrap current create behavior with approval/audit metadata and optional idempotency keys.

**Authorization requirements**

Must enforce project access once project auth exists.

**UI behavior**

Show a save confirmation with title preview before commit.

**Error and failure behavior**

Prevent duplicate writes on retries; surface validation failures.

**Test requirements**

Approval-path tests and idempotent retry tests.

**Future MCP compatibility**

Same capability can back future MCP write tool with explicit confirmation.

**Priority**

High

**Estimated effort**

Medium

## Capabilities Requiring Service Extraction

### Session selection persistence and precedence

- Current implementation:
  - `frontend/src/lib/hooks/useChatSkillSelection.ts`
  - `construction_os/utils/chat_session.py`
- Issue:
  - Manual UI persistence and request override semantics are mixed together.
- Needed extraction:
  - A server-side `chat_defaults` capability service that understands explicit vs ephemeral selections.

### Project chat execution orchestration

- Current implementation:
  - `api/routers/chat.py`
- Issue:
  - Route function builds forwarded props, mutates session defaults, resolves artifact/template metadata, and binds AG-UI response.
- Needed extraction:
  - `construction_os/capabilities/chat.py` or equivalent orchestration service.

### Source chat execution orchestration

- Current implementation:
  - `api/routers/source_chat.py`
- Issue:
  - Similar orchestration duplication relative to project chat.
- Needed extraction:
  - Shared chat execution helper with scope adapters.

### Draft save pipeline for generated outputs

- Current implementation:
  - Artifact execution and project artifact/document saving are separate flows.
- Issue:
  - No reusable draft-save abstraction with approval/audit semantics.
- Needed extraction:
  - `artifacts.py` / `documents.py` capability layer with preview, draft, approve, commit stages.

## Capabilities That Should Not Be Exposed

- MCP connection administration:
  - `api/mcp_service.py`, `api/routers/mcp.py`
  - Unsafe and administrative; belongs in settings UI.
- Knowledge extraction/rebuild/link jobs:
  - `api/routers/knowledge_graph.py`
  - Expensive, operational, and not appropriate for autonomous chat execution in v1.
- Destructive CRUD as initial chat tools:
  - Delete project artifact, delete collection, delete skill, delete document, delete MCP connection.
- Raw database or queue internals:
  - `construction_os/domain/chat_queue.py`, repository-level functions.

## Shared Capability Layer Recommendation

### Suggested folder structure

```text
construction_os/capabilities/
  __init__.py
  registry.py
  models.py
  authz.py
  approvals.py
  audit.py
  context.py
  retrieval.py
  skills.py
  collections.py
  artifacts.py
  documents.py
  knowledge.py
```

### Module boundaries

- `context.py`
  - project/session summary
  - explicit selection resolution
- `retrieval.py`
  - search + ask + project evidence normalization
- `skills.py`
  - catalog, read, validate, draft create/update
- `collections.py`
  - catalog, read, validate, draft create/update
- `artifacts.py`
  - list/get templates, run template draft, save artifact draft
- `documents.py`
  - list templates, create/update document drafts, render/export
- `knowledge.py`
  - safe read-only entity/path access
- `registry.py`
  - tool metadata registry for native tools and later MCP exposure

### Capability registry design

Each tool definition should map to:

```python
{
  "name": "search_project_knowledge",
  "access": "read",
  "requires_approval": False,
  "input_model": SearchProjectKnowledgeInput,
  "output_model": SearchProjectKnowledgeOutput,
  "handler": search_project_knowledge,
}
```

### Input validation

- Use Pydantic models per capability.
- Validate project/session/scope IDs explicitly.
- Validate that selected skill/collection/template/tool IDs exist before use.

### Output contracts

- Prefer typed Pydantic outputs over raw dicts from routers or database queries.
- Include provenance/citation fields consistently.

### Authentication and authorization

- Reuse existing auth for now, but put all future project-level checks behind `capabilities/authz.py`.
- Do not let capability handlers call routers directly; they should work below HTTP.

### Approval policies

- `read`: automatic
- `draft-write`: automatic if unsaved and reversible
- `approved-write`: explicit user confirmation
- `destructive` / `administrative`: not in initial toolset

### Logging and tracing

- Mirror the MCP `ChatToolCall` pattern for internal tools.
- Add an `internal_tool_call` audit model or a generalized capability execution audit.

### Error handling

- Reuse typed exceptions from `construction_os.exceptions`.
- Normalize tool errors into stable structured payloads for both model and UI.

### Idempotency

- Required for any approved write tool.
- Especially important for project artifact saves and document creation.

### Testing

- Unit tests for each capability handler.
- Integration tests for approval behavior and project scoping.
- Regression tests for precedence rules.

### Versioning

- Version tool schemas independently from HTTP endpoints.
- Reuse the existing codebase’s gradual deprecation style where needed.

## Security, Permissions, and Approval Requirements

### Confirmed current boundaries

- Global password middleware only:
  - `api/auth.py`
  - `api/main.py`
- No role-based access control.
- No project ownership enforcement.
- Guest-key restrictions exist only for shared chat sessions, not general project authorization (`api/routers/chat.py`).

### Risks and blockers

- Unauthorized cross-project access is technically possible if a user has instance password access and knows IDs.
- Retrieved source content, skill files, and collection text are injected into prompts without a dedicated prompt-injection mitigation layer.
- Internal write actions have no approval registry or audit trail comparable to MCP tool execution.
- No rate limits or resource limits at the API layer.
- No idempotency keys for artifact/document writes.

### Minimum fixes before enabling write tools

1. Add capability-level approval wrapper.
2. Add project authorization hook point.
3. Add internal capability execution audit logging.
4. Add idempotency protection for approved writes.

## Observability and Testing Requirements

### Existing evidence

- Good MCP execution audit coverage:
  - `construction_os/domain/mcp.py`
  - `construction_os/mcp/progress.py`
  - `tests/test_mcp_chat_loop.py`
- Good loader/validation coverage:
  - `tests/test_skills_standard.py`
  - `tests/test_collections_loader.py`
  - `tests/test_chat_context.py`
  - `tests/test_html_documents_api.py`
  - `tests/test_chat_queue_*`

### Missing for native internal tools

- Capability registry tests
- Approval flow tests
- Selection precedence tests for explicit vs agent-added capabilities
- Project authorization tests
- Duplicate-write/idempotency tests for internal saves

## Future MCP Compatibility

Native chat tools and a future MCP server can share:

- capability handlers in `construction_os/capabilities/`
- Pydantic input/output schemas
- capability metadata registry
- approval classifications
- audit/logging contract

MCP-specific concerns that should remain separate:

- transport/session protocol
- MCP discovery/manifest formatting
- client authentication scheme for external consumers
- MCP-specific result serialization

Good design decisions today for later MCP support:

- Keep native tool metadata declarative.
- Do not bind capability handlers to FastAPI request objects.
- Reuse typed schemas at the capability layer rather than route layer.

## Implementation Phases

### Phase 1: Shared capability preparation

- Scope:
  - Extract capability services for context, retrieval, artifacts, and documents.
- Likely files:
  - New `construction_os/capabilities/*`
  - reuse `construction_os/graphs/chat_context.py`, `api/skills_service.py`, `api/collections_service.py`
- Dependencies:
  - None external.
- Risks:
  - Accidentally duplicating logic already in routers.
- Completion criteria:
  - Internal non-HTTP capability functions exist with typed input/output models.
- Rough effort:
  - `Medium`

### Phase 2: Read-only native tools

- Scope:
  - `get_project_context`, `search_project_knowledge`, `answer_project_question`, `list_skills`, `list_collections`, `list_artifact_templates`
- Likely files:
  - capability registry
  - chat tool binding layer
- Dependencies:
  - Phase 1
- Risks:
  - Selection precedence confusion if tool context is merged incorrectly.
- Completion criteria:
  - Agent can read context and capability catalogs safely.
- Rough effort:
  - `Medium`

### Phase 3: Draft generation tools

- Scope:
  - `run_artifact_template_draft`
  - optional HTML document draft creation
- Likely files:
  - `artifacts.py`, `documents.py`
- Dependencies:
  - Phase 2
- Risks:
  - Output provenance and UI expectations not aligned.
- Completion criteria:
  - Generated outputs are visible but not auto-saved.
- Rough effort:
  - `Medium`

### Phase 4: Approval-based write tools

- Scope:
  - `create_project_artifact_draft`
  - later document-save tools
- Likely files:
  - approvals and audit modules
- Dependencies:
  - Phase 3
- Risks:
  - Duplicate writes and insufficient authorization.
- Completion criteria:
  - Explicit confirmation required before persistence.
- Rough effort:
  - `Large`

### Phase 5: Selection precedence and orchestration improvements

- Scope:
  - explicit vs ephemeral selections
  - agent-added support capabilities
- Likely files:
  - `useChatSkillSelection.ts`
  - `useProjectChat.ts`
  - `construction_os/utils/chat_session.py`
  - capability context resolver
- Dependencies:
  - Phase 2
- Risks:
  - Regressions in existing manual chat UX.
- Completion criteria:
  - Manual selections cannot be silently replaced.
- Rough effort:
  - `Large`

### Phase 6: Future MCP adapter

- Scope:
  - external protocol wrapper only
- Likely files:
  - separate MCP server repo or adapter package
- Dependencies:
  - completed capability layer
- Risks:
  - schema drift if native tools are not treated as canonical.
- Completion criteria:
  - MCP server reuses native capability handlers and schemas.
- Rough effort:
  - `Medium`

## Estimated Effort

- Read-only capability exposure only: `Medium`
- Safe draft generation tools: `Large`
- Full approval-based internal write tooling with proper precedence and audit behavior: `Significant`

Assumptions that could change the estimate materially:

- Whether project-level authorization must be implemented first
- Whether native tool invocation needs a full internal audit log from day one
- Whether current external MCP server contracts must be mirrored exactly

## Open Questions

1. Should MCP tool selections remain transient-only, or become session-persisted like skills/collections/templates?
2. Should artifact defaults apply automatically on agent recommendation, or only after explicit user acceptance?
3. Should `answer_project_question` be exposed as a distinct tool, or kept internal to the chat planner?
4. Is HTML document creation in scope for early chat experiences, or should artifacts remain the only save target initially?
5. What approval UX should be used for internal writes?

## File and Symbol Reference Index

- `api/auth.py` — `PasswordAuthMiddleware`, `check_api_password`
- `api/main.py` — router registration, global auth, exception handlers
- `api/ag_ui_agents.py` — `build_run_input()`, `ag_ui_streaming_response()`
- `api/routers/chat.py` — `execute_chat()`, `build_context()`, `get_chat_suggestions()`
- `api/routers/source_chat.py` — `send_message_to_source_chat()`
- `api/routers/search.py` — `search_knowledge_base()`, `ask_knowledge_base()`
- `api/skills_service.py` — skill CRUD/validation/import/export
- `api/collections_service.py` — collection CRUD/validation/import/export
- `api/routers/artifact_templates.py` — template CRUD and execution
- `api/routers/project_artifacts.py` — artifact save/export/ingest
- `api/routers/html_documents.py` — HTML templates/documents/PDF
- `api/mcp_service.py` — MCP connection/tool listing and audit reads
- `api/routers/mcp.py` — MCP admin endpoints
- `construction_os/domain/project.py` — `Project`, `Source`, `ChatSession`, `text_search()`, `vector_search()`
- `construction_os/domain/project_artifact.py` — `ProjectArtifact`, artifact kind normalization
- `construction_os/domain/artifact.py` — `ArtifactTemplate`, `DefaultPrompts`
- `construction_os/domain/html_document.py` — `HtmlTemplate`, `Document`
- `construction_os/domain/skill.py` — `Skill`, `SkillFile`
- `construction_os/domain/collection.py` — `Collection`, `CollectionItem`
- `construction_os/domain/mcp.py` — `McpConnection`, `McpTool`, `ChatToolCall`
- `construction_os/graphs/chat.py` — project chat graph stages
- `construction_os/graphs/source_chat.py` — source chat graph stages
- `construction_os/graphs/ask.py` — retrieval answer workflow
- `construction_os/graphs/chat_context.py` — project evidence assembly
- `construction_os/skills/loader.py` — skill catalog/read helpers
- `construction_os/collections/loader.py` — collection catalog/context helpers
- `construction_os/mcp/allowlist.py` — read-only MCP allowlist construction
- `construction_os/mcp/execution.py` — audited read-only MCP tool execution
- `construction_os/mcp/chat_loop.py` — model/tool loop with duplicate protection
- `frontend/src/lib/hooks/useChatRuntime.ts` — shared chat runtime orchestration
- `frontend/src/lib/hooks/useChatSkillSelection.ts` — manual selection persistence
- `frontend/src/lib/hooks/useProjectChat.ts` — project chat selection + artifact defaults
- `frontend/src/lib/hooks/useSourceChat.ts` — source chat selection and streaming
- `frontend/src/components/source/ChatComposer.tsx` — manual picker UI surface
- `frontend/src/components/skills/SkillPicker.tsx`
- `frontend/src/components/collections/CollectionPicker.tsx`
- `frontend/src/components/templates/TemplatePicker.tsx`
- `frontend/src/components/mcp/ToolPicker.tsx`
- `frontend/src/components/chat/ChatDefaultsPickerRow.tsx`
- `tests/test_chat_context.py`
- `tests/test_chat_guest_access.py`
- `tests/test_skills_standard.py`
- `tests/test_collections_loader.py`
- `tests/test_html_documents_api.py`
- `tests/test_mcp_chat_loop.py`
- `tests/test_chat_queue_domain.py`

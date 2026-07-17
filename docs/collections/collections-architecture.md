# Collections Architecture — Implementation Note

## Audit summary (2026-07-15)

Construction OS reusable assets today:

| Asset | Storage | Manifest | Chat attach | Auto AI select |
| --- | --- | --- | --- | --- |
| Skills | `skill` + `skill_file` | YAML in `SKILL.md` | `ChatSession.skill_ids` | No |
| Tools | `mcp_connection` + `mcp_tool` | None | `mcp_tool_ids` on request | No |
| Templates | `html_template` | DB fields | `html_template_id` on session | No |
| Artifacts | `artifact` (Artifact templates) | DB prompt fields | Via artifact bar | No |

**No** Collections, Concepts, Project Brains entities, unified context picker, or artifact provenance for skills/tools exist today.

## Extension approach

Collections mirror the **Skills stack** with typed child items:

- `collection` + `collection_item` tables (migration 40)
- `construction_os/collections/` — standard, validation, loader, markdown_io
- API: `collections_service` + `routers/collections.py`
- UI: `/collections` library + editor; `CollectionPicker` in chat composer
- Session: `ChatSession.collection_ids`
- Graph: `loading_collections` node → `collections_context` in system prompt

## Deferred to follow-up slices

- Project ↔ collection graph edges
- AI manifest-based auto-selection
- Per-message item subset UI
- Artifact provenance
- Embeddings / semantic discovery
- Full visibility scopes (use `visibility: instance` like Skills)

## Key files

| Layer | Path |
| --- | --- |
| Domain | `construction_os/domain/collection.py` |
| Validation | `construction_os/collections/standard.py` |
| Loader | `construction_os/collections/loader.py` |
| API | `api/collections_service.py`, `api/routers/collections.py` |
| Graph | `construction_os/graphs/chat.py`, `source_chat.py` |
| Prompts | `prompts/chat/system.jinja`, `prompts/source_chat/system.jinja` |
| Frontend | `frontend/src/app/(dashboard)/collections/`, `CollectionPicker.tsx` |

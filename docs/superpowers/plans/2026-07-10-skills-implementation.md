# Skills Feature Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Ship Skills as SurrealDB-backed folder packages with ZIP import/export, tree editing, validation, and chat progressive disclosure (manual select; no AI create/critique).

**Architecture:** `skill` + `skill_file` ObjectModels; shared `open_notebook/skills/standard.py`; service layer for ZIP/validate/export; Transformations-like UI; chat accepts `skill_ids` and injects SKILL.md + on-demand file read.

**Tech Stack:** FastAPI, SurrealDB, Pydantic, Next.js, TanStack Query, MarkdownEditor, zipfile

---

## File map

| Path | Role |
|------|------|
| `open_notebook/skills/standard.py` | Canonical rules + frontmatter parse |
| `open_notebook/skills/zip_io.py` | Safe extract + ZIP rebuild |
| `open_notebook/skills/validation.py` | Deterministic validation |
| `open_notebook/skills/loader.py` | Build chat skill context + file read |
| `open_notebook/domain/skill.py` | Skill, SkillFile models |
| `open_notebook/database/migrations/16.surrealql` | Schema |
| `api/skills_service.py` | Domain orchestration |
| `api/routers/skills.py` | HTTP API |
| `api/models.py` / `api/skill_models.py` | Schemas |
| `prompts/chat/system.jinja` | Skill section in system prompt |
| `frontend/.../skills/*` | List, detail, upload review, tree, editor |
| `frontend/.../chat` | Skill multi-select |
| `tests/test_skills_*.py` | Unit tests |

---

### Task 1: Standard + ZIP + validation (pure Python)

- [ ] Create `open_notebook/skills/` package
- [ ] Implement standard, zip_io, validation with tests first
- [ ] Cover path traversal, missing SKILL.md, frontmatter, round-trip ZIP

### Task 2: Domain + migration

- [ ] `Skill` / `SkillFile` ObjectModels
- [ ] Migration 16 + register in `async_migrate.py`
- [ ] Register subclasses for polymorphic get

### Task 3: API service + router

- [ ] CRUD, import preview/confirm, file ops, validate, export
- [ ] Wire router in `main.py`

### Task 4: Chat integration

- [ ] Accept `skill_ids` on chat endpoints
- [ ] Inject SKILL.md into system prompt state
- [ ] Add tool or context helper to read skill files for selected skills

### Task 5: Frontend manage UI

- [ ] API client, hooks, types, i18n keys (en at minimum; follow locale pattern)
- [ ] List + detail + ZIP review + file tree + editor
- [ ] Sidebar nav entry

### Task 6: Frontend chat picker

- [ ] Multi-select skills in notebook chat (and source chat)
- [ ] Pass `skill_ids` on send

### Task 7: Verify

- [ ] `uv run pytest tests/test_skills*.py`
- [ ] Smoke existing tests if feasible
- [ ] Document manual verification + deferred items

**Deferred:** AI create, AI critique, skill sets, multi-user ACL

# HTML-Native Bid Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload branded HTML bid templates, create project documents with Page/Amounts/Code editing, duplicate scenarios, and export PDF that matches the HTML.

**Architecture:** New `HtmlTemplate` (global) and `Document` (project-scoped) ObjectModels. Span text is the editable unit; Page patches only replace span text. PDF uses xhtml2pdf on raw `html_body`. Parallel to AI Artifacts — does not replace them.

**Tech Stack:** FastAPI, SurrealDB, Pydantic, regex span helpers, xhtml2pdf, Next.js, TanStack Query, sandboxed iframe

**Spec:** `docs/superpowers/specs/2026-07-13-html-native-bid-documents-design.md`

---

## File map

| Path | Role |
|------|------|
| `construction_os/utils/html_spans.py` | Extract/replace span texts; structure-guard |
| `construction_os/utils/html_pdf_export.py` | `render_html_pdf(html_body) -> bytes` |
| `frontend/src/lib/utils/html-spans.ts` | Client-side span extract for Amounts panel |
| `construction_os/domain/html_document.py` | `HtmlTemplate`, `Document` models |
| `construction_os/domain/__init__.py` | Register models for polymorphic get |
| `construction_os/database/migrations/31.surrealql` | Schema |
| `construction_os/database/migrations/31_down.surrealql` | Rollback |
| `construction_os/database/async_migrate.py` | Register migration 31 |
| `api/models.py` | Pydantic request/response schemas |
| `api/routers/html_documents.py` | Templates + documents API |
| `api/main.py` | Mount router |
| `frontend/src/lib/types/html-documents.ts` | TS types |
| `frontend/src/lib/api/html-documents.ts` | API client |
| `frontend/src/lib/hooks/use-html-documents.ts` | React Query hooks |
| `frontend/src/lib/api/query-client.ts` | Query keys |
| `frontend/src/app/(dashboard)/documents/page.tsx` | Template library + create document |
| `frontend/src/app/(dashboard)/documents/[id]/page.tsx` | Workspace Page/Amounts/Code |
| `frontend/src/components/layout/AppSidebar.tsx` | Nav link |
| `frontend/src/lib/locales/*/index.ts` | i18n keys |
| `tests/test_html_spans.py` | Span unit tests |
| `tests/test_html_pdf_export.py` | PDF unit tests |
| `tests/test_html_documents_api.py` | API smoke tests |

---

### Task 1: Span extract / replace / structure guard

**Files:**
- Create: `construction_os/utils/html_spans.py`
- Test: `tests/test_html_spans.py`

- [x] **Step 1:** `extract_spans`, `apply_span_updates`, `assert_same_span_structure` + `StructureChangedError`
- [x] **Step 2:** Unit tests for extract, replace, structure guard

```python
# Core API
extract_spans(html) -> list[SpanField]  # index, text
apply_span_updates(html, {index: new_text}) -> str
assert_same_span_structure(before, after)  # raises StructureChangedError
```

---

### Task 2: HTML PDF render helper

**Files:**
- Create: `construction_os/utils/html_pdf_export.py`
- Test: `tests/test_html_pdf_export.py`

- [x] **Step 1:** `render_html_pdf(html_body: str) -> bytes` via xhtml2pdf (no markdown wrap)
- [x] **Step 2:** Unit test returns non-empty PDF bytes starting with `%PDF`

---

### Task 3: Domain models + migration 31

**Files:**
- Create: `construction_os/domain/html_document.py`
- Create: `construction_os/database/migrations/31.surrealql`
- Create: `construction_os/database/migrations/31_down.surrealql`
- Modify: `construction_os/database/async_migrate.py`
- Modify: `construction_os/domain/__init__.py`

- [x] **Step 1:** `HtmlTemplate` (`html_template`) + `Document` (`document`) ObjectModels
- [x] **Step 2:** SCHEMAFULL tables + indexes; register in AsyncMigrationManager

---

### Task 4: API router + schemas

**Files:**
- Modify: `api/models.py`
- Create: `api/routers/html_documents.py`
- Modify: `api/main.py`
- Test: `tests/test_html_documents_api.py`

- [x] **Step 1:** CRUD templates; create/list/get/patch/duplicate/preview/export.pdf documents
- [x] **Step 2:** Page updates via `span_updates`; Code via `html_body` + `allow_structure_change`
- [x] **Step 3:** API tests with mocked domain models

Endpoints:
- `GET/POST /api/templates/html`, `GET/PATCH/DELETE /api/templates/html/{id}`
- `GET/POST /api/projects/{id}/documents`
- `GET/PATCH/DELETE /api/documents/{id}`
- `POST /api/documents/{id}/duplicate`
- `GET /api/documents/{id}/preview`
- `GET /api/documents/{id}/export.pdf`

---

### Task 5: Frontend API + hooks + types + i18n + nav

**Files:**
- Create: `frontend/src/lib/types/html-documents.ts`
- Create: `frontend/src/lib/api/html-documents.ts`
- Create: `frontend/src/lib/hooks/use-html-documents.ts`
- Create: `frontend/src/lib/utils/html-spans.ts`
- Modify: `frontend/src/lib/api/query-client.ts`
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
- Modify: `frontend/src/lib/locales/*/index.ts`

- [x] **Step 1:** Client + hooks mirroring API
- [x] **Step 2:** Sidebar **Bid Documents** → `/documents`
- [x] **Step 3:** Translation keys under `documents.*` / `navigation.documents`

---

### Task 6: Template library page

**Files:**
- Create: `frontend/src/app/(dashboard)/documents/page.tsx`

- [x] **Step 1:** Upload `.html` → create template
- [x] **Step 2:** List templates; create document into a project; delete template

---

### Task 7: Document workspace

**Files:**
- Create: `frontend/src/app/(dashboard)/documents/[id]/page.tsx`

- [x] **Step 1:** Tabs **Page | Amounts | Code** (synced)
- [x] **Step 2:** Page = iframe, `contenteditable` spans, blur → `span_updates`
- [x] **Step 3:** Amounts = indexed fields → same API
- [x] **Step 4:** Code save dialog: this document vs update template
- [x] **Step 5:** Duplicate scenario + Export PDF

---

### Task 8: Verify + ship

- [x] **Step 1:** Run pytest on html_* tests — 14 passed
- [x] **Step 2:** Code → Update template also saves current document
- [x] **Step 3:** Commit all feature files + plan
- [ ] **Step 4:** Manual smoke (user): upload KCDBC HTML → create doc → edit total → duplicate → export PDF

**Deferred (v1):** Chromium PDF, drag-drop designer, add/remove rows in Page mode, CSV/KG auto-fill

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| HTML upload as template | 4, 6 |
| Document copy from template | 4, 6 |
| Page / Amounts / Code synced | 7 |
| Live edit spans only | 1, 4, 7 |
| Code: save doc vs update template | 4, 7 |
| Scenario duplicate | 4, 7 |
| Export PDF from HTML | 2, 4, 7 |
| Structure guard on Page | 1, 4 |

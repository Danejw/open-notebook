# HTML-Native Bid Documents — Design

**Date:** 2026-07-13  
**Status:** Approved for planning  
**Product:** Construction OS

## Problem

Estimators need branded PDF-ready bid documents (estimates first; SOWs/RFIs later) that look like the company’s real HTML proposals. Layout must stay consistent. Users need to fill different data per trade/scenario and export a PDF that matches what they see.

Existing Construction OS “artifact templates” are AI prompts → markdown, with a generic PDF export. That is not the right model for KCDBC-style bid summaries.

## Goals

- Upload a real branded HTML file as the template.
- Create documents from that template; edit text/numbers; export PDF that matches the HTML.
- Support named scenario copies (Base / Alt A / …) with the same layout.
- Keep editing simple: page-first; optional Amounts and Code views stay in sync.

## Non-goals (v1)

- Visual drag-and-drop template designer.
- Add/remove table rows or list items in Page mode.
- Chromium-based PDF (use existing HTML→PDF path first; upgrade later if fidelity fails).
- Heavy CSV / knowledge-graph auto-fill into spans (optional later).
- Replacing AI artifact templates.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Primary docs | Estimates / bid summaries first; SOW & RFI later via same mechanism |
| Brand consistency | Comes from the uploaded HTML/CSS itself |
| Template source | User-uploaded HTML (e.g. KCDBC bid summary) |
| Editing | **C:** Page (default) + Amounts + Code, synchronized |
| Page mode | Click/edit existing `<span>` text and numbers only |
| Structure changes | Only via Code (HTML) |
| Code save | Explicit: **Save to this document** vs **Update template** |
| Scenarios | Duplicate document (named HTML copies) |
| PDF | Render document HTML → PDF |

## Architecture

```
HtmlTemplate (uploaded HTML)
        │
        ▼  create document (copy HTML)
Document instance (html_body snapshot, scenario_label, project_id)
        │
        ├── Page view (default) — edit <span> values only
        ├── Amounts view — list of spans, same data
        └── Code view — full HTML; save → document XOR template
        │
        ├── Duplicate → new Document (new scenario)
        └── Export PDF ← same html_body
```

Documents are a **new feature** alongside Artifacts (AI prompts). They do not replace Artifacts.

## Components

### Frontend

- **Template library:** upload/import `.html`, list/rename/delete templates.
- **Document workspace:** scenario switcher, Duplicate, Export PDF; tabs **Page | Amounts | Code**.
- **Page editor:** sandboxed preview of `html_body`; highlight editable spans; inline edit values only; reject DOM structure changes from Page mode.
- **Amounts panel:** derived list of span texts; edits write back into matching spans.
- **Code panel:** source editor; on save show dialog: “this document” vs “update template”.

### Backend

- **`HtmlTemplate`:** `id`, `name`, `category` (estimate/sow/rfi/other), `html_body`, timestamps.
- **`Document`:** `id`, `project_id`, `template_id`, `title`, `scenario_label`, `html_body`, `parent_document_id` (optional), timestamps.
- **Span sync:** treat `<span>…</span>` (without nested block structure requirements beyond text) as editable fields; Page patches only replace span text nodes.
- **RenderService:** `html_body` → preview response + PDF bytes (extend/adapt `xhtml2pdf` path used for artifact notes; keep HTML as source of truth).

### API (sketch)

- `POST /templates/html` — upload template  
- `GET /templates/html` — list  
- `PATCH /templates/html/{id}` — rename / update html_body (from “Update template”)  
- `POST /projects/{id}/documents` — create from template_id  
- `GET/PATCH /documents/{id}` — load / save html_body (Page/Amounts)  
- `POST /documents/{id}/duplicate` — new scenario  
- `GET /documents/{id}/preview` — HTML  
- `GET /documents/{id}/export.pdf` — PDF  

## Data flow

1. Upload HTML → `HtmlTemplate`.
2. New document → copy `html_body`, `scenario_label=Base`.
3. Page/Amounts edit → update span texts in document `html_body` only.
4. Code edit → user chooses document save or template update.
5. Duplicate → copy current `html_body` + new scenario label + `parent_document_id`.
6. Export → PDF from current document `html_body`.

**Reference shape (from real KCDBC files):** same CSS/layout; variable data only in spans (project name, trade, totals, duration, drawings, scope/exclusion bullets, notes). Carpentry vs Mechanical = different span values, same structure.

## Error handling

- Invalid/non-HTML upload → reject with clear message.
- Page edit that would alter structure → ignore / block; prompt to use Code.
- PDF render failure → surface error; keep document saved.
- “Update template” → confirm; does **not** rewrite existing documents/scenarios unless user separately chooses to.
- Empty required display: allow empty spans; PDF still exports.

## Testing

- Unit: span extract/replace; structure-guard for Page patches.
- API: upload → create → patch spans → duplicate → export PDF (smoke).
- Manual: load `_final_filled_carpentry.html` and `_final_filled_mechanical.html` as templates; create docs; change totals; export; confirm brand matches browser preview.

## Success criteria

- Uploaded KCDBC HTML looks correct in Page view.
- Editing a total/trade updates Page, Amounts, and Code together.
- Scenario duplicates share layout, independent values.
- Exported PDF matches on-screen brand layout for these templates (within xhtml2pdf limits).

## Implementation note

Prefer the smallest change that ships this loop. Reuse project scoping and existing PDF tooling where possible. Do not build a schema/form designer for v1 — the HTML file **is** the template.

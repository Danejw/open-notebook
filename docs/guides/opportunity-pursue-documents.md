# Manual test: Opportunity pursue documents + SAM description

Focused checklist for SAM description text, solicitation download on Pursue, project Sources, and Hub document display.

**Prerequisites**

- API healthy on `http://127.0.0.1:5055` (`GET /health`)
- SurrealDB running
- Frontend on port 3000
- `SAM_GOV_API_KEY` set in `.env`
- surreal-commands worker running (for extract/embed after Pursue):

```powershell
$env:PYTHONUTF8 = '1'
.\.venv\Scripts\python.exe -m surreal_commands.cli.worker --import-modules commands
```

---

## 1. Sync and verify real description text

1. Open **Opportunity Hub** (`/opportunities`).
2. Click **Sync SAM.gov**.
3. Wait for success toast with created/updated counts.
4. Select a recently synced notice.
5. In **Plain-English scope**, confirm you see narrative text — **not** a bare `https://api.sam.gov/.../noticedesc...` URL.
6. If an older notice still shows a URL, re-select it (detail GET backfills) or re-sync; after backfill, scope should become prose.

**Pass:** Scope is readable solicitation text (or a clear empty/unavailable state), not a raw noticedesc link.

---

## 2. Documents visible before Pursue

1. Select a notice that has SAM attachments (`resourceLinks`).
2. In the detail panel **Documents** section, confirm:
   - Each file is listed by name (or URL basename)
   - Each row is a clickable external link to the SAM attachment
   - There is **no** ingest status badge yet (not pursued)
3. Also confirm **Primary point of contact** and **Contracting office** show values when SAM provided them.

**Pass:** Attachments and contact/office details are inspectable before committing to a bid workspace.

---

## 3. Pursue downloads files into project Sources

1. Pick a notice with at least one document and **no** existing project.
2. Click **Pursue and create workspace**.
3. Confirm navigation to `/projects/{id}`.
4. On the project **Sources** list, confirm one Source per successful attachment download.
5. Wait for processing (worker): sources should leave “extracting” and gain extracted text / embeddings as usual.
6. Confirm **Opportunity Intake Summary** artifact still exists.

**Pass:** Solicitation files landed as normal project sources and ran the extract/embed pipeline.

---

## 4. Hub shows ingest status after Pursue

1. Return to Opportunity Hub and select the pursued notice.
2. Confirm status is **Pursuing** and **Open bid workspace** is shown.
3. In **Documents**:
   - Successful files show a **Queued** (or similar) badge and **Open in workspace**
   - Any failed download shows **Failed** (hover/title may show the error)
4. Click **Open in workspace** / **Open bid workspace** and land on the same project.

**Pass:** Hub reflects per-file ingest outcome without leaving the opportunity detail.

---

## 5. Best-effort failure still creates a workspace

1. If you can force a bad attachment URL (or use a notice with a dead link), Pursue anyway.
2. Confirm the project is still created and status becomes pursuing.
3. Failed rows are marked **Failed**; successful rows still queue as Sources.

**Pass:** One bad file does not block workspace creation.

---

## 6. Re-pursue is idempotent

1. On an already pursuing notice, use **Open bid workspace** (Pursue is hidden when `project_id` is set).
2. Via API optional check: `POST /api/opportunities/{id}/pursue` returns `project_created: false` and does **not** add duplicate sources.

**Pass:** Second pursue does not re-download or duplicate Sources.

---

## 7. Empty documents

1. Select a notice with zero discovered documents.
2. Confirm **No documents discovered**.
3. Pursue still creates the project and intake artifact.

**Pass:** Empty attachment list is handled cleanly.

---

## Checklist

- [ ] Sync stores prose descriptions (not noticedesc URLs)
- [ ] Opening an old URL-scope notice backfills description
- [ ] Hub lists clickable documents before Pursue
- [ ] Pursue creates Sources that extract/embed
- [ ] Hub shows queued/failed status after Pursue
- [ ] Failed downloads do not block project creation
- [ ] Re-pursue does not duplicate sources

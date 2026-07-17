# Drawing Extraction — How It Works

A plain-language overview of architectural drawing extraction in Construction OS, and how it connects to embeddings and the knowledge graph.

---

## The big idea

When you upload a PDF, Construction OS already runs the **normal source pipeline**: extract text, chunk it, embed those chunks, and (optionally) build generic knowledge-graph entities.

**Drawing extraction is a separate, opt-in second pass** for plan sets and sheets. It does not replace source text or source embeddings. It reads the same PDF with a drawing-aware lens and produces:

1. Structured facts about sheets (rooms, notes, finishes, sheet numbers, etc.)
2. Searchable “drawing knowledge” snippets (embeddings)
3. Graph entities and relationships that fit the existing knowledge graph

Think of it as: *normal upload understands the document as text; drawing extraction understands it as a set of construction sheets.*

---

## How it fits with everything else

```
┌─────────────────────────────────────────────────────────────┐
│  Source upload (always)                                     │
│  PDF → text/chunks → source_embedding → chat / Ask / search │
│  (optional) generic knowledge-graph extraction              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │  opt-in, separate job
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Drawing extraction (this system)                           │
│  PDF pages → classify sheets → extract items → publish      │
│                                                             │
│  • drawing_* tables (run, pages, items, relationships…)     │
│  • drawing_embedding  (alongside source embeddings)         │
│  • knowledge graph    (additive; does not wipe other KG)    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Ask / Search / RAG                                         │
│  Normal evidence + (when enabled) drawing evidence merged   │
└─────────────────────────────────────────────────────────────┘
```

**Important isolation rules:**

- Drawing runs do **not** change `source.full_text`, `source_embedding`, or the source’s pipeline stage.
- Drawing embeddings live in their own table (`drawing_embedding`), next to — not instead of — normal source embeddings.
- Knowledge-graph publish **adds** drawing entities; it does not delete what other extractors already wrote.

---

## What triggers a run

Drawing extraction is **opt-in**. You queue it for one or more PDF sources (API: `POST /api/drawing-extractions/extract`). That creates a run record and submits a background job (`extract_architectural_drawings`).

If the file has not changed (same content hash) and an active completed run already exists, the job **skips** unless you pass `force=true`.

---

## The pipeline, step by step

Each run walks every page of the PDF. Status moves roughly like this:

`queued` → `inspecting` → `extracting` → `validating` → `publishing` → `completed` (or `partial` / `failed`)

### 1. Inspect the page

Open the PDF and gather **deterministic evidence**: words, text blocks, vector paths, images, page size, and a plain-text excerpt. This is the ground truth the rest of the pipeline leans on.

### 2. Render visual assets

Render a full-page image, a thumbnail, grid crops, and later region crops. These live under the drawing extraction output folder (for review and evidence), not as a replacement for the source asset.

### 3. Decide: is this a drawing sheet?

A **deterministic classifier** looks at text density, geometry, filename/title cues, and known sheet patterns. Optional vision (when enabled) can refine sheet number, title, discipline, and drawing type — but it is not allowed to invent sheet numbers out of thin air.

Non-drawing pages are recorded and skipped for deep extraction.

### 4. Find regions on drawing pages

Heuristics locate areas like title block, notes, legend, revision table, and main view. Each region gets a crop for evidence.

### 5. Extract structured items

From PDF text and layout, the extractor pulls typed items — for example:

- Sheet metadata (number, title, scale, project name)
- Rooms / spaces
- Finish tags
- Notes and callouts
- Fixtures / equipment
- Dimensions, grids, symbols, schedule-ish content
- Cross-sheet references

Items get a stable id, confidence, bounding boxes when available, and provenance (how they were found).

### 6. Clean up and validate

Duplicates are merged, conflicts noted, and page-level checks add warnings when something looks incomplete or inconsistent.

### 7. Build semantic records

Items are turned into **readable knowledge snippets** meant for search — not raw dump chunks. Examples:

- A whole-sheet summary (“Sheet A-101 — Floor Plan… contains N rooms…”)
- Room lists, finish schedules, note collections, cross-references

These records are the bridge to embeddings.

### 8. Publish (optional, on by default)

If publishing is enabled:

1. **Embeddings** — embed each semantic record into `drawing_embedding`
2. **Knowledge graph** — map items/relationships into the shared KG writer

Successful runs with drawing pages are marked **active** so retrieval can find them.

---

## How embeddings fit in

| Layer | What it stores | Used for |
| --- | --- | --- |
| **Source embeddings** | Chunks of extracted source text | Normal Ask / search / RAG |
| **Drawing embeddings** | Drawing semantic records (sheet summaries, room lists, etc.) | Drawing-aware evidence when RAG mode allows it |

Drawing embed publish:

1. Takes the semantic record texts from the run
2. Generates vectors with the shared embedding helper
3. Stores them in `drawing_embedding`, linked to run, source, page, sheet metadata, confidence, and optional evidence crop path

When someone asks a question, retrieval can search these vectors and return evidence labeled as coming from drawings (sheet number, confidence, crop path, etc.).

### Drawing RAG modes

Controlled by `CONSTRUCTION_OS_DRAWING_RAG_MODE`:

| Mode | Behavior |
| --- | --- |
| `off` (default) | Ignore drawing embeddings; Ask/search behave as before |
| `shadow` | Compute drawing hits for logging/comparison, but **do not** merge them into answers |
| `on` | Merge drawing evidence with normal vector/text/graph evidence |

So you can extract and store drawing knowledge safely before turning it on for users.

---

## How the knowledge graph fits in

Drawing items are projected into the **same knowledge-graph write path** other extractors use. Types are mapped into graph-friendly labels, for example:

- room → Space  
- finish → Material  
- fixture / equipment → Equipment  
- note → Note  
- door / window / wall → Door / Window / Wall  
- sheet metadata → DrawingMetadata / Sheet  

Relationships from the drawing run (plus helpers like “room located_on Sheet X”) are written as graph relations.

This is **additive**: drawing publish does not wipe generic KG output from the normal source pipeline. Both can coexist for the same PDF.

Graph RAG (entities/hops in Ask) remains a separate switch (`CONSTRUCTION_OS_GRAPH_RAG_MODE`). Drawing KG data becomes available to that system once published; drawing **vector** evidence is gated by the drawing RAG mode above.

---

## What gets stored

A run owns a tree of records:

| Record | Role |
| --- | --- |
| `drawing_extraction_run` | One job: status, stats, models, file hash, active flag |
| `drawing_page` | Per-page classification, renders, evidence summary |
| `drawing_region` | Title block, notes, legend, etc. |
| `drawing_item` | Individual extracted facts |
| `drawing_relationship` | Links between items |
| `drawing_semantic_record` | Search-oriented text built from items |
| `drawing_embedding` | Vectors for those semantic records |

On disk, page renders and crops are kept under the configured drawing extraction folder, keyed by source and run/hash.

---

## How this shows up in Ask / Search

The shared evidence retriever (used by Ask and similar paths) already gathers vector, text, and optionally graph evidence. After that, it may call drawing merge:

1. Embed the user query
2. Search active `drawing_embedding` rows for the project
3. Skip rejected/unsupported hits
4. Prefer higher-confidence / verified results
5. Merge into the evidence list when mode is `on`

Chat that sends **full source text** still uses the normal source content. Drawing extraction mainly improves **retrieval-style** answers (Ask / search), and anything else that consumes the same evidence bundle.

---

## Mental model in one sentence

**Upload once for general text intelligence; optionally run drawing extraction so the same PDF also contributes sheet-aware facts, drawing-specific search vectors, and additive graph entities — without overwriting the original source pipeline.**

---

## Related code (for developers)

| Concern | Location |
| --- | --- |
| End-to-end pipeline | `construction_os/drawing/pipeline.py` |
| Semantic records | `construction_os/drawing/semantic.py` |
| Embeddings publish | `construction_os/drawing/embeddings.py` |
| KG publish | `construction_os/drawing/kg_publish.py` |
| RAG merge | `construction_os/drawing/retrieval.py` + `construction_os/retrieval/evidence_retriever.py` |
| API | `api/routers/drawing_extraction.py` |
| Background job | `commands/drawing_commands.py` |
| Schema | `construction_os/database/migrations/44.surrealql` |

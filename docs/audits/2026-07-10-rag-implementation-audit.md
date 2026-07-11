# RAG Implementation Audit

**Date:** 2026-07-10  
**Scope:** Code-as-source-of-truth review of retrieval, embedding, Ask, Chat, and Search  
**Verdict:** Construction OS uses **classic vector RAG** (chunk → embed → cosine similarity), orchestrated by a **LangGraph multi-query workflow**. It is **not GraphRAG**.

---

## Executive summary

| Question | Answer |
|----------|--------|
| Is it RAG? | **Yes** — for **Ask** and for standalone **Search** (vector mode) |
| Is it GraphRAG? | **No** — no entity extraction, no knowledge-graph traversal for retrieval, no community summaries |
| What is “graph” in the stack? | (1) **SurrealDB** stores organizational relations (`reference`, `project_note`, `refers_to`); (2) **LangGraph** orchestrates Ask as a state machine. Neither is GraphRAG. |
| Chat RAG? | **No** — Chat / Source Chat stuff selected full content (or summaries/insights) into the prompt |

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│ INGESTION                                                                │
│  Source extract (content-core) → full_text                               │
│  embed_source job → chunk_text → generate_embeddings → source_embedding  │
│  Note/Insight save → embed_note / embed_insight → single vector on row   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STORAGE (SurrealDB)                                                      │
│  source_embedding: per-chunk content + embedding[]                       │
│  source_insight.embedding, note.embedding: one vector per record         │
│  BM25 SEARCH indexes on text fields                                      │
│  Relations: source→project, note→project (org only, not used in RAG)   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   POST /search (text)      POST /search (vector)      POST /search/ask
   BM25 via fn::text_search Cosine via fn::vector_   Multi-query RAG
                            search                   (ask LangGraph)
          │                         │                         │
          └─────────────┬───────────┘                         │
                        ▼                                     ▼
                 Search UI results              Strategy → parallel vector
                                                searches → sub-answers →
                                                final synthesis + citations
```

---

## Is it GraphRAG?

**No.** GraphRAG (e.g. Microsoft GraphRAG-style systems) typically:

1. Extracts entities and relationships from documents  
2. Builds a knowledge graph  
3. Retrieves via graph traversal / community detection / graph summaries  
4. Optionally combines that with vector search  

**What Construction OS actually does:**

| GraphRAG trait | Present? | Evidence |
|----------------|----------|----------|
| Entity / relation extraction from content | No | No matches for GraphRAG, knowledge graph, entity extract, community detect in codebase |
| Knowledge-graph retrieval | No | `vector_search` / `text_search` only; Ask hard-codes `vector_search` |
| Community / hierarchical summaries for RAG | No | Insights are artifact outputs, not graph communities |
| Vector chunk retrieval | **Yes** | `source_embedding` + cosine similarity |
| Multi-hop query planning | Partial | Ask LLM plans up to ~5 search *terms*, not graph hops |

**SurrealDB graph edges** (`reference`, `project_note`, `refers_to` in migrations `1.surrealql` / `20.surrealql`) link sources/notes to projects and chat sessions. They are **not** walked during Ask/Search retrieval.

**LangGraph** in `construction_os/graphs/ask.py` is a **workflow graph** (agent → parallel provide_answer → final_answer), not a document knowledge graph.

---

## What kind of RAG it is

Best label: **Multi-query vector RAG with LLM synthesis** (sometimes called “agentic RAG” lightly), plus a separate **BM25 full-text search** path.

### Pattern breakdown

1. **Indexing:** Content-type-aware chunking + dense embeddings  
2. **Retrieval:** Brute-force cosine similarity over stored vectors (SurrealDB `vector::similarity::cosine`), with `minimum_score` filter (default `0.2`)  
3. **Augmentation (Ask only):** Retrieved chunks/insights/notes injected into prompts; sub-answers synthesized into a final answer with citation IDs  
4. **Keyword path:** BM25 via SurrealDB `SEARCH` analyzer (not used by Ask today)

There is **no ANN index** (no HNSW/MTREE) defined for embeddings in migrations — similarity is computed in SurrealQL with filters/limits.

---

## Pipeline 1 — Indexing (prepare for retrieval)

### Source documents (chunked)

**Entry:** `Source.vectorize()` → submits `embed_source` command  
**Implementation:** `commands/embedding_commands.py` → `embed_source_command`

Flow:

1. Load `Source` by ID; require non-empty `full_text`  
2. `DELETE source_embedding WHERE source = $source_id` (idempotent rebuild)  
3. `detect_content_type(full_text, file_path)`  
4. `chunk_text(...)`  
5. `generate_embeddings(chunks)` (batched)  
6. Bulk `INSERT` into `source_embedding` with `{source, order, content, embedding}`

**Schema** (`construction_os/database/migrations/1.surrealql`):

```surql
DEFINE TABLE source_embedding SCHEMAFULL;
-- source: record<source>, order: int, content: string, embedding: array<float>
```

### Notes and insights (single vector)

| Item | Command | Storage |
|------|---------|---------|
| Note | `embed_note` (on `Note.save()`) | `note.embedding` — one vector; long text mean-pooled |
| Insight | `embed_insight` (after `create_insight`) | `source_insight.embedding` — one vector; mean-pooled if long |

Sources do **not** auto-embed on save; callers must set `embed=True` / call `vectorize()`.

### Chunking (`construction_os/utils/chunking.py`)

| Setting | Default | Env var |
|---------|---------|---------|
| Chunk size | **400 tokens** | `CONSTRUCTION_OS_CHUNK_SIZE` |
| Overlap | **15% of chunk size** | `CONSTRUCTION_OS_CHUNK_OVERLAP` |
| Min chunk | **5 tokens** | `CONSTRUCTION_OS_MIN_CHUNK_SIZE` |

Strategies:

- **HTML** → `HTMLHeaderTextSplitter` (h1–h3) + secondary recursive split  
- **Markdown** → `MarkdownHeaderTextSplitter` (#–###) + secondary split  
- **Plain** → `RecursiveCharacterTextSplitter` (token-length via tiktoken `o200k_base`)

### Embedding generation (`construction_os/utils/embedding.py`)

- Provider via `model_manager.get_embedding_model()` (Esperanto)  
- Batch size: `CONSTRUCTION_OS_EMBEDDING_BATCH_SIZE` (default 50), 3 retries  
- Long single texts for notes/insights/queries: chunk → embed → **mean pool** (normalize → mean → normalize)

---

## Pipeline 2 — Standalone search (not full RAG)

**API:** `POST /search` — `api/routers/search.py`  
**Domain:** `text_search` / `vector_search` in `construction_os/domain/project.py`

### Text search (BM25)

- SurrealDB function `fn::text_search` (latest shape from migration `4.surrealql`)  
- Analyzer: `my_analyzer` with snowball(english) + lowercase  
- Searches: source title, source full_text, source_embedding content, source_insight content, note title/content  
- Returns grouped hits with relevance scores and highlights  
- On SurrealDB `search::highlight` “position overflow”, falls back to `vector_search` (issue #648)

### Vector search (semantic)

- Embed query with `generate_embedding(keyword)`  
- Call `fn::vector_search($embed, $results, $source, $note, $minimum_score)`  
- **Current definition:** migration `9.surrealql`

Searches three corpora (when flags allow):

1. `source_embedding` (chunk-level)  
2. `source_insight` (whole insight)  
3. `note` (whole note)

Filters: `embedding != none`, matching vector length, cosine ≥ `min_similarity`.  
Groups by id/parent/title; returns `similarity` + flattened `matches` content.

**Scope:** Global across the database — **no project_id filter** on Search or Ask request models.

**Prerequisite:** Default embedding model must be configured (`model_manager.get_embedding_model()`).

---

## Pipeline 3 — Ask (the RAG product path)

**API:** `POST /search/ask` (SSE) and `POST /search/ask/simple`  
**Graph:** `construction_os/graphs/ask.py`  
**Prompts:** `prompts/ask/{entry,query_process,final_answer}.jinja`

### LangGraph state machine

```
START → agent (strategy) → [Send × N] provide_answer → write_final_answer → END
```

| Node | Role | Model config key |
|------|------|------------------|
| `agent` | LLM plans reasoning + up to 5 `{term, instructions}` searches | `strategy_model` |
| `provide_answer` | `vector_search(term, 10, sources=True, notes=True)` then LLM answers from results | `answer_model` |
| `write_final_answer` | Synthesize all sub-answers into one response | `final_answer_model` |

Parallelism: `trigger_queries` uses LangGraph `Send` to fan out one `provide_answer` per planned search.

### Hard-coded retrieval choice

In `provide_answer`:

```python
# text_search path is commented out
results = await vector_search(state["term"], 10, True, True)
```

Ask is **vector-only**. Empty retrieval → empty answers list for that branch.

### Citations

Prompts require IDs like `[source:…]`, `[note:…]`, `[insight:…]` from retrieved result IDs only (anti-hallucination instructions).

### Streaming

SSE events: `strategy` → `answer` (per sub-answer) → `final_answer` → `complete` (or `error`).

---

## Pipeline 4 — Chat / Source Chat (not RAG)

Documented in `docs/2-CORE-CONCEPTS/ai-context-rag.md` and confirmed in code.

### Project Chat (`construction_os/graphs/chat.py`)

- Receives pre-built `context` string in state  
- System prompt from `chat/system` + message history  
- **No** `vector_search` / `text_search` in the graph  
- Context assembled by API (`api/routers/context.py` / chat router): user-selected sources/notes at levels:
  - **insights** → `Source.get_context("short")` (title + insights)  
  - **full content** → `get_context("long")` (includes `full_text`)  
  - **not in** → excluded  

This is **context stuffing / full-document prompting**, not retrieval-augmented generation.

### Source Chat (`construction_os/graphs/source_chat.py`)

- `ContextBuilder` loads one source (+ insights), token-budgeted  
- Still injects selected content into the system prompt — not similarity retrieval over the corpus  

---

## Dual AI-context model (product behavior)

| Feature | Mechanism | Retrieval? |
|---------|-----------|------------|
| **Ask** | Multi-query vector RAG + synthesis | Automatic over all embedded sources/notes/insights |
| **Search (vector)** | Cosine similarity listing | Yes (browse results) |
| **Search (text)** | BM25 | Yes (keyword) |
| **Chat** | Manual context levels | No |
| **Source Chat** | Single-source context builder | No |

---

## Key files (source of truth)

| Area | Path |
|------|------|
| Ask workflow | `construction_os/graphs/ask.py` |
| Chat workflow | `construction_os/graphs/chat.py` |
| Source chat | `construction_os/graphs/source_chat.py` |
| Search + Ask API | `api/routers/search.py` |
| Context API | `api/routers/context.py` |
| Domain search + Source.vectorize | `construction_os/domain/project.py` |
| Embed jobs | `commands/embedding_commands.py` |
| Chunking | `construction_os/utils/chunking.py` |
| Embeddings | `construction_os/utils/embedding.py` |
| Context builder | `construction_os/utils/context_builder.py` |
| Vector/text SQL fns | `construction_os/database/migrations/9.surrealql` (`fn::vector_search`), `4.surrealql` (`fn::text_search`) |
| Schema | `construction_os/database/migrations/1.surrealql` |
| Ask prompts | `prompts/ask/*.jinja` |
| User-facing RAG docs | `docs/2-CORE-CONCEPTS/ai-context-rag.md` |

---

## Gaps, quirks, and implications

1. **Not GraphRAG** — upgrading to GraphRAG would be a new subsystem (entity graph + graph-aware retrieval), not a rename of LangGraph/SurrealDB.  
2. **Ask ignores BM25** — strategy always uses vector search; hybrid retrieval is unused in Ask despite text search existing.  
3. **No project scoping** — Ask/Search query the whole DB; project membership is not a retrieval filter.  
4. **Brute-force vectors** — no HNSW/MTREE; cost grows with corpus size.  
5. **Asymmetric embedding storage** — sources = many chunk vectors; notes/insights = one (possibly mean-pooled) vector → retrieval granularity differs.  
6. **Chat is not RAG** — large projects rely on user selection and context window limits; docs note community interest in adding RAG to Chat.  
7. **Docs vs code on chunk size** — user guide historically said “~500 words”; code default is **400 tokens** (configurable). Prefer code/env vars.  
8. **Embedding model required** — vector Search and Ask fail closed without a configured embedding model.  
9. **SurrealDB “graph” confusion** — relational edges organize projects; they do not power multi-hop document reasoning.

---

## Terminology cheat sheet

| Term in this repo | Meaning |
|-------------------|---------|
| LangGraph / `graphs/ask.py` | Workflow orchestration for Ask |
| SurrealDB graph relations | Project membership / session links |
| Vector search / RAG | Dense embedding similarity over chunks & records |
| GraphRAG | **Not implemented** |

---

## Bottom line

Construction OS’s retrieval-augmented path is a **standard dense-vector RAG stack** with a **multi-query LLM planner** on top (Ask). Storage uses SurrealDB (which happens to be a graph database) and orchestration uses LangGraph (which happens to be a graph of nodes). Neither makes the system GraphRAG.

For future work, treat “add GraphRAG” and “add RAG to Chat” as separate designs from the current Ask vector pipeline.

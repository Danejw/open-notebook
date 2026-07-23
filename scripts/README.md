# Scripts Documentation

## eval_retrieval.py

Measures retrieval recall@k (vector vs hybrid) against the seeded fixture
corpus in `tests/eval/graph_rag/` (RAG-010).

Stable IDs: `project:retrieval_eval`, `source:eval_*`.

### Dry-run (CI)

Validates dataset + corpus shape (fixture IDs required) and prints per-class
counts. No DB or embedder required. PR CI always runs this step.

```bash
CONSTRUCTION_OS_EVAL_DRY_RUN=1 uv run python scripts/eval_retrieval.py
# or
CONSTRUCTION_OS_EVAL_DRY_RUN=1 python scripts/eval_retrieval.py
```

Unit coverage: `tests/test_eval_retrieval_dry_run.py`.

### Seed fixture (local)

Upserts only the dedicated eval project/sources and embeds them. Does not
delete other records.

```bash
uv run python scripts/seed_retrieval_eval.py
```

### Full eval (local / seeded DB)

Requires SurrealDB + embeddings configured, and a prior seed.

```bash
# Optional: override top-k (default 10) and recall floor (default 0.9)
CONSTRUCTION_OS_EVAL_LIMIT=10 CONSTRUCTION_OS_EVAL_MIN_RECALL=0.9 \
  uv run python scripts/eval_retrieval.py
```

Prints recall@k by mode (`vector`, `hybrid`) and query class. Exits with code 1
if any mode's ALL average is below `CONSTRUCTION_OS_EVAL_MIN_RECALL`.

Unit coverage: `tests/test_eval_retrieval_dry_run.py` (includes threshold gate).

---

## export_docs.py

Consolidates markdown documentation files for use with ChatGPT or other platforms with file upload limits.

### What It Does

- Scans all subdirectories in the `docs/` folder
- For each subdirectory, combines all `.md` files (excluding `index.md` files)
- Creates one consolidated markdown file per subdirectory
- Saves all exported files to `doc_exports/` in the project root

### Usage

```bash
# Using Makefile (recommended)
make export-docs

# Or run directly with uv
uv run python scripts/export_docs.py

# Or run with standard Python
python scripts/export_docs.py
```

### Output

The script creates `doc_exports/` directory with consolidated files like:

- `getting-started.md` - All getting-started documentation
- `user-guide.md` - All user guide content
- `features.md` - All feature documentation
- `development.md` - All development documentation
- etc.

Each exported file includes:
- A main header with the folder name
- Section headers for each source file
- Source file attribution
- The complete content from each markdown file
- Visual separators between sections

### Example Output Structure

```markdown
# Getting Started

This document consolidates all content from the getting-started documentation folder.

---

## Installation

*Source: installation.md*

[Full content of installation.md]

---

## Quick Start

*Source: quick-start.md*

[Full content of quick-start.md]

---
```

### Notes

- The `doc_exports/` directory is gitignored and safe to regenerate anytime
- Index files (`index.md`) are automatically excluded
- Files are sorted alphabetically for consistent output
- The script handles subdirectories only (ignores files in the root `docs/` folder)

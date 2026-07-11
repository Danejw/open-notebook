"""Restore corrupted checklist naming table and check off completed phases."""
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "docs/audits/2026-07-10-construction-os-rebrand-checklist.md"
text = path.read_text(encoding="utf-8")

text = text.replace(
    "**Goal:** Fully rebrand the application from **Construction OS** to **Construction OS**",
    "**Goal:** Fully rebrand the application from **Open Notebook** to **Construction OS**",
)
text = text.replace(
    "**Last updated:** 2026-07-10 (implementation in progress on branch)\n\nWhen every box",
    "When every box",
)
if "**Last updated:**" not in text.split("When every box")[0]:
    text = text.replace(
        "When every box in this file is checked, the rebrand is done.",
        "**Last updated:** 2026-07-10 — implementation in progress on branch.\n\nWhen every box in this file is checked, the rebrand is done.",
        1,
    )

naming = """| Construction OS (new) | Open Notebook (old) | Layers affected |
|-----------------------|---------------------|-----------------|
| Construction OS | Open Notebook | Brand, UI, docs, metadata |
| `construction_os` | `open_notebook` | Python package, imports |
| `construction_os` | `open_notebook` | Surreal namespace + database |
| `construction_os:*` | `open_notebook:*` | Singleton record IDs |
| `CONSTRUCTION_OS_*` | `OPEN_NOTEBOOK_*` | Environment variables |
| `construction-os` | `open-notebook` / `lfnovo/open_notebook` | Docker image / service |
| `ConstructionOSError` | `OpenNotebookError` | Exception base class |"""

import re

text = re.sub(
    r"\| Construction OS \(new\) \| Construction OS \(old\).*?\| Sources / Notes / Insights \| Same \| Copy only \(construction-aware wording\) \|",
    naming
    + """
| **Project** (`project`) | Notebook (`notebook`) | DB table, IDs, API, UI, i18n |
| **Artifact** (`artifact`) | Transformation (`transformation`) | DB table, IDs, API, UI, i18n |
| `project_note` relation | `artifact` relation (note→notebook) | DB relation (renamed to free up "artifact") |
| `reference` → project | `reference` → notebook | DB relation retarget |
| `refers_to` → project\\|source | `refers_to` → notebook\\|source | DB relation retarget |
| Skills | Skills | Copy only (already named well) |
| Tools | Tools (MCP) | Copy only |
| Sources / Notes / Insights | Same | Copy only (construction-aware wording) |""",
    text,
    count=1,
    flags=re.DOTALL,
)

phase2 = """- [x] 2.1 Define `artifact` table with the same fields as `transformation` (`name`, `title`, `description`, `prompt`, `apply_default`, `created`, `updated`)
- [x] 2.2 Copy all rows: `transformation` → `artifact` — `rebrand_migration.py`
- [x] 2.3 Rename singleton `open_notebook:default_prompts` field `transformation_instructions` → `artifact_instructions` (migrate value)
- [ ] 2.4 Update `source_insight.insight_type` references if they embed the word "transformation" (data-level; usually just titles — safe)
- [x] 2.5 Drop the `transformation` table
- [x] 2.6 Write `21_down.surrealql` reversing the rename
- [ ] **Verify:** existing insights still resolve; artifact list loads post-migration"""

text = re.sub(
    r"- \[ \] 2\.1 Define `artifact` table.*?- \[ \] \*\*Verify:\*\* existing insights still resolve; artifact list loads post-migration",
    phase2,
    text,
    count=1,
    flags=re.DOTALL,
)

phase4 = """- [x] 4.1 Register migrations 20, 21, 22 (up and down) in `construction_os/database/async_migrate.py`
- [x] 4.2 Update `AsyncMigrationManager` count/docstring to reflect new total
- [ ] 4.3 Rename Surreal namespace & database `open_notebook` → `construction_os` in `construction_os/database/repository.py` defaults (and env references)
- [x] 4.4 Rename all singleton record IDs `open_notebook:*` → `construction_os:*`:
  - [x] `construction_os:default_models` (`construction_os/ai/models.py`)
  - [x] `construction_os:default_prompts` (`construction_os/domain/artifact.py`)
  - [ ] `construction_os:provider_configs` (`construction_os/domain/provider_config.py`)
  - [ ] `construction_os:content_settings` (`construction_os/domain/content_settings.py`)
  - [ ] Any others found via search for `open_notebook:`
- [x] 4.5 Add a migration or startup step to migrate existing singleton records to the new IDs (copy then delete old) — `rebrand_migration.py`
- [ ] 4.6 Update `construction_os/database/CLAUDE.md`
- [ ] **Verify:** app boots against `construction_os` namespace; settings/models/credentials load"""

text = re.sub(
    r"- \[ \] 4\.1 Register migrations 20, 21, 22.*?- \[ \] \*\*Verify:\*\* app boots against `construction_os` namespace; settings/models/credentials load",
    phase4,
    text,
    count=1,
    flags=re.DOTALL,
)

phase5 = """## Phase 5 — Python package rename `open_notebook` → `construction_os`

This touches nearly every backend import. Do it as one mechanical pass, then fix stragglers.

- [x] 5.1 Rename the directory `open_notebook/` → `construction_os/`
- [x] 5.2 Update every `from open_notebook...` / `import open_notebook...` → `construction_os` across `api/`, `commands/`, `tests/`, `scripts/`, `run_api.py`
- [x] 5.3 Update `pyproject.toml` (package name, packages, scripts, entry points)
- [x] 5.4 Update `uv.lock` via dependency tooling (regenerate, don't hand-edit)
- [ ] 5.5 Update `mypy.ini`, any `setup`/config referencing the package path
- [x] 5.6 Update migration file path strings in `construction_os/database/async_migrate.py`
- [x] 5.7 Rename exception base `OpenNotebookError` → `ConstructionOSError` in `construction_os/exceptions.py` and all references
- [ ] 5.8 Update `commands/*.py` `app="open_notebook"` → `app="construction_os"` (surreal-commands app id)
- [ ] **Verify:** `uv run python -c "import construction_os"` works; `uv run pytest -q` green"""

text = re.sub(
    r"## Phase 5 — Python package rename `construction_os` → `construction_os`.*?- \[ \] \*\*Verify:\*\* `uv run python -c \"import construction_os\"` works; `uv run pytest -q` imports resolve",
    phase5,
    text,
    count=1,
    flags=re.DOTALL,
)

path.write_text(text, encoding="utf-8")
print("Checklist restored and updated")

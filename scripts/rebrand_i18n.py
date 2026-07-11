"""Rebrand i18n locale files for Construction OS."""
from __future__ import annotations

import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "src" / "lib" / "locales"

for locale_dir in root.iterdir():
    if not locale_dir.is_dir():
        continue
    index = locale_dir / "index.ts"
    if not index.exists():
        continue
    text = index.read_text(encoding="utf-8")
    text = text.replace("Open Notebook", "Construction OS")
    text = text.replace("  notebooks:", "  projects:")
    text = text.replace("  transformations:", "  artifacts:")
    text = re.sub(r"(\s+)notebook:", r"\1project:", text)
    text = re.sub(r"(\s+)transformation:", r"\1artifact:", text)
    text = text.replace("newNotebook", "newProject")
    text = text.replace("deleteNotebook", "deleteProject")
    text = text.replace("searchNotebooks", "searchProjects")
    text = text.replace("notebookNotFound", "projectNotFound")
    text = text.replace("transformationNotFound", "artifactNotFound")
    text = text.replace("editTransformation", "editArtifact")
    text = text.replace("selectTransformation", "selectArtifact")
    text = text.replace("saveToNotebooks", "saveToProjects")
    text = text.replace("manageNotebooks", "manageProjects")
    text = text.replace("loadingNotebooks", "loadingProjects")
    text = text.replace("noNotebooksFound", "noProjectsFound")
    text = text.replace("transformationModel", "artifactModel")
    text = text.replace('"Notebooks"', '"Projects"')
    text = text.replace('"Transformations"', '"Artifacts"')
    text = text.replace('"Notebook"', '"Project"')
    text = text.replace('"Transformation"', '"Artifact"')
    index.write_text(text, encoding="utf-8")
    print(f"Updated {index}")

"""One-off frontend rebrand string replacements."""
from __future__ import annotations

import pathlib

REPLACEMENTS = [
    ("Open Notebook", "Construction OS"),
    ("NotebookResponse", "ProjectResponse"),
    ("NotebookCreate", "ProjectCreate"),
    ("NotebookUpdate", "ProjectUpdate"),
    ("NotebookDelete", "ProjectDelete"),
    ("NotebookChat", "ProjectChat"),
    ("useNotebookChat", "useProjectChat"),
    ("notebook_id", "project_id"),
    ("notebookId", "projectId"),
    ("/notebooks", "/projects"),
    ("/transformations", "/artifacts"),
    ("/api/notebooks", "/api/projects"),
    ("/api/transformations", "/api/artifacts"),
    ("t('notebooks.", "t('projects."),
    ("t('transformations.", "t('artifacts."),
    ("useNotebooks", "useProjects"),
    ("useTransformations", "useArtifacts"),
    ("notebooksApi", "projectsApi"),
    ("transformationsApi", "artifactsApi"),
    ("openNotebookDialog", "openProjectDialog"),
    ("CreateNotebookDialog", "CreateProjectDialog"),
    ("NotebookList", "ProjectList"),
    ("NotebookRow", "ProjectRow"),
    ("NotebookCard", "ProjectCard"),
    ("NotebookHeader", "ProjectHeader"),
    ("NotebookDeleteDialog", "ProjectDeleteDialog"),
    ("NotebookAssociations", "ProjectAssociations"),
    ("NotebooksStep", "ProjectsStep"),
    ("SaveToNotebooksDialog", "SaveToProjectsDialog"),
    ("TransformationsList", "ArtifactsList"),
    ("TransformationCard", "ArtifactCard"),
    ("TransformationEditorDialog", "ArtifactEditorDialog"),
    ("TransformationPlayground", "ArtifactPlayground"),
    ("default_transformation_model", "default_artifact_model"),
    ("transformation_id", "artifact_id"),
    ("transformation_instructions", "artifact_instructions"),
    ("TransformationResponse", "ArtifactResponse"),
    ("notebook-view-store", "project-view-store"),
    ("notebook-columns-store", "project-columns-store"),
    ("notebook-context", "project-context"),
    ("use-notebooks", "use-projects"),
    ("use-transformations", "use-artifacts"),
    ("@/lib/api/notebooks", "@/lib/api/projects"),
    ("@/lib/api/transformations", "@/lib/api/artifacts"),
]

root = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "src"
count = 0
for path in root.rglob("*"):
    if path.suffix not in {".ts", ".tsx"}:
        continue
    text = path.read_text(encoding="utf-8")
    orig = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != orig:
        path.write_text(text, encoding="utf-8")
        count += 1
print(f"Updated {count} frontend files")

"""Fix frontend t() call sites for Phase 12 i18n rebrand."""

from __future__ import annotations

from pathlib import Path

FRONTEND_SRC = Path("frontend/src")

# t('old.key') -> t('new.key') replacements
T_CALL_REPLACEMENTS: list[tuple[str, str]] = [
    ("t('notebooks.", "t('projects."),
    ('t("notebooks.', 't("projects.'),
    ("t('transformations.", "t('artifacts."),
    ('t("transformations.', 't("artifacts.'),
    ("t('navigation.notebooks')", "t('navigation.projects')"),
    ('t("navigation.notebooks")', 't("navigation.projects")'),
    ("t('navigation.transformations')", "t('navigation.artifacts')"),
    ('t("navigation.transformations")', 't("navigation.artifacts")'),
    ("t('navigation.transformation')", "t('navigation.artifact')"),
    ('t("navigation.transformation")', 't("navigation.artifact")'),
    ("t('common.newNotebook')", "t('common.newProject')"),
    ('t("common.newNotebook")', 't("common.newProject")'),
    ("t('common.notebook')", "t('common.project')"),
    ('t("common.notebook")', 't("common.project")'),
    ("t('common.notebookLabel')", "t('common.projectLabel')"),
    ('t("common.notebookLabel")', 't("common.projectLabel")'),
    ("t('common.editTransformation')", "t('common.editArtifact')"),
    ('t("common.editTransformation")', 't("common.editArtifact")'),
    ("t('common.accessibility.searchNotebooks')", "t('common.accessibility.searchProjects')"),
    ('t("common.accessibility.searchNotebooks")', 't("common.accessibility.searchProjects")'),
    ("t('common.accessibility.transformationViews')", "t('common.accessibility.artifactViews')"),
    ('t("common.accessibility.transformationViews")', 't("common.accessibility.artifactViews")'),
    ("t('projects.newNotebook')", "t('projects.newProject')"),
    ('t("projects.newNotebook")', 't("projects.newProject")'),
    ("t('projects.activeNotebooks')", "t('projects.activeProjects')"),
    ('t("projects.activeNotebooks")', 't("projects.activeProjects")'),
    ("t('projects.archivedNotebooks')", "t('projects.archivedProjects')"),
    ('t("projects.archivedNotebooks")', 't("projects.archivedProjects")'),
    ("t('projects.deleteNotebook')", "t('projects.deleteProject')"),
    ('t("projects.deleteNotebook")', 't("projects.deleteProject")'),
    ("t('projects.deleteNotebookDesc')", "t('projects.deleteProjectDesc')"),
    ('t("projects.deleteNotebookDesc")', 't("projects.deleteProjectDesc")'),
    ("t('projects.deleteNotebookNotes')", "t('projects.deleteProjectNotes')"),
    ('t("projects.deleteNotebookNotes")', 't("projects.deleteProjectNotes")'),
    ("t('projects.deleteNotebookNoNotes')", "t('projects.deleteProjectNoNotes')"),
    ('t("projects.deleteNotebookNoNotes")', 't("projects.deleteProjectNoNotes")'),
    ("t('projects.deleteNotebookSharedSources')", "t('projects.deleteProjectSharedSources')"),
    ('t("projects.deleteNotebookSharedSources")', 't("projects.deleteProjectSharedSources")'),
    ("t('projects.deleteNotebookNoSources')", "t('projects.deleteProjectNoSources')"),
    ('t("projects.deleteNotebookNoSources")', 't("projects.deleteProjectNoSources")'),
    ("t('projects.deleteNotebookExclusiveSources')", "t('projects.deleteProjectExclusiveSources')"),
    ('t("projects.deleteNotebookExclusiveSources")', 't("projects.deleteProjectExclusiveSources")'),
    ("t('artifacts.noTransformations')", "t('artifacts.noArtifacts')"),
    ('t("artifacts.noTransformations")', 't("artifacts.noArtifacts")'),
    ("t('sources.manageNotebooks')", "t('sources.manageProjects')"),
    ('t("sources.manageNotebooks")', 't("sources.manageProjects")'),
    ("t('sources.manageNotebooksDesc')", "t('sources.manageProjectsDesc')"),
    ('t("sources.manageNotebooksDesc")', 't("sources.manageProjectsDesc")'),
    ("t('sources.noNotebooksAvailable')", "t('sources.noProjectsAvailable')"),
    ('t("sources.noNotebooksAvailable")', 't("sources.noProjectsAvailable")'),
    ("t('sources.noNotebooksFound')", "t('sources.noProjectsFound')"),
    ('t("sources.noNotebooksFound")', 't("sources.noProjectsFound")'),
    ("t('sources.selectTransformation')", "t('sources.selectArtifact')"),
    ('t("sources.selectTransformation")', 't("sources.selectArtifact")'),
    ("t('sources.cannotSaveNoteNoNotebook')", "t('sources.cannotSaveNoteNoProject')"),
    ('t("sources.cannotSaveNoteNoNotebook")', 't("sources.cannotSaveNoteNoProject")'),
    ("t('sources.sourcesAddedToNotebook')", "t('sources.sourcesAddedToProject')"),
    ('t("sources.sourcesAddedToNotebook")', 't("sources.sourcesAddedToProject")'),
    ("t('sources.failedToAddSourcesToNotebook')", "t('sources.failedToAddSourcesToProject')"),
    ('t("sources.failedToAddSourcesToNotebook")', 't("sources.failedToAddSourcesToProject")'),
    ("t('sources.sourceRemovedFromNotebook')", "t('sources.sourceRemovedFromProject')"),
    ('t("sources.sourceRemovedFromNotebook")', 't("sources.sourceRemovedFromProject")'),
    ("t('sources.failedToRemoveSourceFromNotebook')", "t('sources.failedToRemoveSourceFromProject')"),
    ('t("sources.failedToRemoveSourceFromNotebook")', 't("sources.failedToRemoveSourceFromProject")'),
    ("t('sources.removeFromNotebook')", "t('sources.removeFromProject')"),
    ('t("sources.removeFromNotebook")', 't("sources.removeFromProject")'),
    ("t('searchPage.saveToNotebooks')", "t('searchPage.saveToProjects')"),
    ('t("searchPage.saveToNotebooks")', 't("searchPage.saveToProjects")'),
    ("t('searchPage.saveToNotebook')", "t('searchPage.saveToProject')"),
    ('t("searchPage.saveToNotebook")', 't("searchPage.saveToProject")'),
    ("t('searchPage.selectNotebook')", "t('searchPage.selectProject')"),
    ('t("searchPage.selectNotebook")', 't("searchPage.selectProject")'),
    ("t('chat.chatWithNotebook')", "t('chat.chatWithProject')"),
    ('t("chat.chatWithNotebook")', 't("chat.chatWithProject")'),
    ("t('podcasts.loadingNotebooks')", "t('podcasts.loadingProjects')"),
    ('t("podcasts.loadingNotebooks")', 't("podcasts.loadingProjects")'),
    ("t('podcasts.noNotebooksFoundInPodcasts')", "t('podcasts.noProjectsFoundInPodcasts')"),
    ('t("podcasts.noNotebooksFoundInPodcasts")', 't("podcasts.noProjectsFoundInPodcasts")'),
    ("t('models.transformationModelLabel')", "t('models.artifactModelLabel')"),
    ('t("models.transformationModelLabel")', 't("models.artifactModelLabel")'),
    ("t('models.transformationModelDesc')", "t('models.artifactModelDesc')"),
    ('t("models.transformationModelDesc")', 't("models.artifactModelDesc")'),
    ("t('apiErrors.notebookNotFound')", "t('apiErrors.projectNotFound')"),
    ('t("apiErrors.notebookNotFound")', 't("apiErrors.projectNotFound")'),
    ("t('apiErrors.transformationNotFound')", "t('apiErrors.artifactNotFound')"),
    ('t("apiErrors.transformationNotFound")', 't("apiErrors.artifactNotFound")'),
]

SKIP_DIRS = {"node_modules", ".next", "__pycache__"}


def fix_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    original = text
    changes = 0
    for old, new in T_CALL_REPLACEMENTS:
        count = text.count(old)
        if count:
            text = text.replace(old, new)
            changes += count
    if text != original:
        path.write_text(text, encoding="utf-8")
    return changes


def main() -> None:
    total = 0
    files_changed = 0
    for path in FRONTEND_SRC.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in {".ts", ".tsx"}:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        count = fix_file(path)
        if count:
            print(f"{path}: {count} replacements")
            total += count
            files_changed += 1
    print(f"Done. {total} t() call sites fixed across {files_changed} files.")


if __name__ == "__main__":
    main()

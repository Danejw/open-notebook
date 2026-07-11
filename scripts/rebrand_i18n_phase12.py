"""Phase 12 i18n rebrand: rename keys and update Construction OS terminology."""

from __future__ import annotations

import re
from pathlib import Path

LOCALES_DIR = Path("frontend/src/lib/locales")

# Key renames applied to every locale file (key name only, not values).
KEY_RENAMES: list[tuple[str, str]] = [
    ("notebookLabel:", "projectLabel:"),
    ("transformationViews:", "artifactViews:"),
    ("activeNotebooks:", "activeProjects:"),
    ("archivedNotebooks:", "archivedProjects:"),
    ("cannotSaveNoteNoNotebook:", "cannotSaveNoteNoProject:"),
    ("sourcesAddedToNotebook:", "sourcesAddedToProject:"),
    ("failedToAddSourcesToNotebook:", "failedToAddSourcesToProject:"),
    ("sourceRemovedFromNotebook:", "sourceRemovedFromProject:"),
    ("failedToRemoveSourceFromNotebook:", "failedToRemoveSourceFromProject:"),
    ("removeFromNotebook:", "removeFromProject:"),
    ("noNotebooksAvailable:", "noProjectsAvailable:"),
    ("noTransformations:", "noArtifacts:"),
    ("saveToNotebook:", "saveToProject:"),
    ("selectNotebook:", "selectProject:"),
    ("chatWithNotebook:", "chatWithProject:"),
]

# en-US display string updates (old -> new).
EN_US_VALUE_REPLACEMENTS: list[tuple[str, str]] = [
    ('newProject: "New Notebook"', 'newProject: "New Project"'),
    ('projectLabel: "Notebook: {name}"', 'projectLabel: "Project: {name}"'),
    ('editArtifact: "Edit Transformation"', 'editArtifact: "Edit Artifact"'),
    ('artifactViews: "Transformation views"', 'artifactViews: "Artifact views"'),
    ('searchProjects: "Search notebooks"', 'searchProjects: "Search projects"'),
    ('projectNotFound: "Notebook not found"', 'projectNotFound: "Project not found"'),
    ('artifactNotFound: "Transformation not found"', 'artifactNotFound: "Artifact not found"'),
    ('searchPlaceholder: "Search notebooks..."', 'searchPlaceholder: "Search projects..."'),
    ('deleteProject: "Delete Notebook"', 'deleteProject: "Delete Project"'),
    (
        'deleteProjectExclusiveSources: "{count} source(s) exist only in this notebook."',
        'deleteProjectExclusiveSources: "{count} source(s) exist only in this project."',
    ),
    (
        'deleteProjectSharedSources: "{count} source(s) are shared with other notebooks and will be unlinked."',
        'deleteProjectSharedSources: "{count} source(s) are shared with other projects and will be unlinked."',
    ),
    ('deleteProjectNoSources: "No sources in this notebook."', 'deleteProjectNoSources: "No sources in this project."'),
    ('activeProjects: "Active Notebooks"', 'activeProjects: "Active Projects"'),
    ('archivedProjects: "Archived Notebooks"', 'archivedProjects: "Archived Projects"'),
    ('notFound: "Notebook not found"', 'notFound: "Project not found"'),
    ('notFoundDesc: "The requested notebook does not exist."', 'notFoundDesc: "The requested project does not exist."'),
    ('namePlaceholder: "Notebook name"', 'namePlaceholder: "Project name"'),
    ('createNew: "Create New Notebook"', 'createNew: "Create New Project"'),
    ('descPlaceholder: "Add more info about this notebook here..."', 'descPlaceholder: "Add more info about this project here..."'),
    ('createSuccess: "Notebook created successfully"', 'createSuccess: "Project created successfully"'),
    ('updateSuccess: "Notebook updated successfully"', 'updateSuccess: "Project updated successfully"'),
    ('deleteSuccess: "Notebook deleted successfully"', 'deleteSuccess: "Project deleted successfully"'),
    (
        'cannotSaveNoteNoProject: "Cannot save note: notebook ID not available"',
        'cannotSaveNoteNoProject: "Cannot save note: project ID not available"',
    ),
    (
        'sourcesAddedToProject: "{count} source(s) added to notebook"',
        'sourcesAddedToProject: "{count} source(s) added to project"',
    ),
    ('failedToAddSourcesToProject: "Failed to add sources to notebook"', 'failedToAddSourcesToProject: "Failed to add sources to project"'),
    (
        'sourceRemovedFromProject: "Source removed from notebook successfully"',
        'sourceRemovedFromProject: "Source removed from project successfully"',
    ),
    (
        'failedToRemoveSourceFromProject: "Failed to remove source from notebook"',
        'failedToRemoveSourceFromProject: "Failed to remove source from project"',
    ),
    ('removeConfirm: "Are you sure you want to remove this from the notebook?"', 'removeConfirm: "Are you sure you want to remove this from the project?"'),
    ('selectArtifact: "Select a transformation..."', 'selectArtifact: "Select an artifact..."'),
    (
        'createFirstInsight: "Create your first insight using a transformation above"',
        'createFirstInsight: "Create your first insight using an artifact above"',
    ),
    (
        'batchCommonSettings: "The same notebooks and transformations will be applied to all items."',
        'batchCommonSettings: "The same projects and artifacts will be applied to all items."',
    ),
    ('manageProjects: "Manage Notebooks"', 'manageProjects: "Manage Projects"'),
    ('manageProjectsDesc: "Manage which notebooks contain this source"', 'manageProjectsDesc: "Manage which projects contain this source"'),
    ('noProjectsAvailable: "No notebooks available"', 'noProjectsAvailable: "No projects available"'),
    ('removeFromProject: "Remove from Notebook"', 'removeFromProject: "Remove from Project"'),
    (
        'addExistingDesc: "Select existing sources from across all your notebooks to add to the current one."',
        'addExistingDesc: "Select existing sources from across all your projects to add to the current one."',
    ),
    ('noProjectsFound: "No notebooks found."', 'noProjectsFound: "No projects found."'),
    ('chatWithProject: "Chat with Notebook"', 'chatWithProject: "Chat with Project"'),
    ('startByCreating: "Start by creating your first notebook to organize your research."', 'startByCreating: "Start by creating your first project to organize your research."'),
    ('saveToProjects: "Save to Notebooks"', 'saveToProjects: "Save to Projects"'),
    ('saveToProject: "Save to Notebook"', 'saveToProject: "Save to Project"'),
    ('saveSuccess: "Successfully saved to notebook"', 'saveSuccess: "Successfully saved to project"'),
    ('saveError: "Failed to save to notebook"', 'saveError: "Failed to save to project"'),
    ('selectProject: "Select Notebook"', 'selectProject: "Select Project"'),
    ('contentDesc: "Pick notebooks, sources, and notes to include in this episode."', 'contentDesc: "Pick projects, sources, and notes to include in this episode."'),
    ('loadingProjects: "Loading notebooks..."', 'loadingProjects: "Loading projects..."'),
    (
        'noProjectsFoundInPodcasts: "No notebooks found. Create a notebook and add content before generating a podcast."',
        'noProjectsFoundInPodcasts: "No projects found. Create a project and add content before generating a podcast."',
    ),
    ('noSources: "No sources available in this notebook."', 'noSources: "No sources available in this project."'),
    ('noNotes: "No notes available in this notebook."', 'noNotes: "No notes available in this project."'),
    (
        'noEpisodesYet: "No podcast episodes yet. Generate your first one from the notebook or source chat interfaces."',
        'noEpisodesYet: "No podcast episodes yet. Generate your first one from the project or source chat interfaces."',
    ),
    (
        'desc: "Transformations are prompts that will be used by the LLM to process a source and extract insights, summaries, etc."',
        'desc: "Artifacts are prompts that will be used by the LLM to process a source and extract insights, summaries, etc."',
    ),
    ('defaultPrompt: "Default Transformation Prompt"', 'defaultPrompt: "Default Artifact Prompt"'),
    ('defaultPromptDesc: "This will be added to all your transformation prompts"', 'defaultPromptDesc: "This will be added to all your artifact prompts"'),
    (
        'defaultPromptPlaceholder: "Enter your default transformation instructions..."',
        'defaultPromptPlaceholder: "Enter your default artifact instructions..."',
    ),
    ('listTitle: "Custom Transformations"', 'listTitle: "Custom Artifacts"'),
    ('runTest: "Run Transformation"', 'runTest: "Run Artifact"'),
    ('selectToStart: "Select a transformation to start"', 'selectToStart: "Select an artifact to start"'),
    ('promptPlaceholder: "Write the prompt that will power this transformation..."', 'promptPlaceholder: "Write the prompt that will power this artifact..."'),
    ('descriptionPlaceholder: "Describe what this transformation does."', 'descriptionPlaceholder: "Describe what this artifact does."'),
    ('createSuccess: "Transformation created successfully"', 'createSuccess: "Artifact created successfully"'),
    ('updateSuccess: "Transformation updated successfully"', 'updateSuccess: "Artifact updated successfully"'),
    ('deleteSuccess: "Transformation deleted successfully"', 'deleteSuccess: "Artifact deleted successfully"'),
    ('noArtifacts: "No transformations yet"', 'noArtifacts: "No artifacts yet"'),
    ('createOne: "Create a transformation to get started"', 'createOne: "Create an artifact to get started"'),
    ('deleteConfirm: "Are you sure you want to delete this transformation?"', 'deleteConfirm: "Are you sure you want to delete this artifact?"'),
    ('artifactModelLabel: "Transformation Model"', 'artifactModelLabel: "Artifact Model"'),
    ('artifactModelDesc: "Used for summaries, insights, and transformations"', 'artifactModelDesc: "Used for summaries, insights, and artifacts"'),
]

# Per-locale value substitutions (notebook/transformation terminology in translations).
LOCALE_VALUE_SUBS: dict[str, list[tuple[str, str]]] = {
    "de-DE": [
        ("Notebook", "Projekt"),
        ("Notebooks", "Projekte"),
        ("Transformation", "Artefakt"),
        ("Transformationen", "Artefakte"),
        ("Transformations", "Artefakte"),
    ],
    "es-ES": [
        ("Cuaderno", "Proyecto"),
        ("Cuadernos", "Proyectos"),
        ("Transformación", "Artefacto"),
        ("Transformaciones", "Artefactos"),
        ("notebook", "proyecto"),
        ("notebooks", "proyectos"),
    ],
    "pt-BR": [
        ("Caderno", "Projeto"),
        ("Cadernos", "Projetos"),
        ("Transformação", "Artefato"),
        ("Transformações", "Artefatos"),
        ("notebook", "projeto"),
        ("notebooks", "projetos"),
    ],
    "fr-FR": [
        ("Carnet", "Projet"),
        ("Carnets", "Projets"),
        ("Transformation", "Artefact"),
        ("Transformations", "Artefacts"),
        ("notebook", "projet"),
        ("notebooks", "projets"),
    ],
    "it-IT": [
        ("Notebook", "Progetto"),
        ("Notebooks", "Progetti"),
        ("Trasformazione", "Artefatto"),
        ("Trasformazioni", "Artefatti"),
    ],
    "pl-PL": [
        ("Notatnik", "Projekt"),
        ("Notatniki", "Projekty"),
        ("Transformacja", "Artefakt"),
        ("Transformacje", "Artefakty"),
    ],
    "ca-ES": [
        ("Quadern", "Projecte"),
        ("Quaderns", "Projectes"),
        ("Transformació", "Artefacte"),
        ("Transformacions", "Artefactes"),
    ],
    "tr-TR": [
        ("Defter", "Proje"),
        ("Defterler", "Projeler"),
        ("Dönüşüm", "Artefakt"),
        ("Dönüşümler", "Artefaktlar"),
    ],
    "ru-RU": [
        ("Блокнот", "Проект"),
        ("Блокноты", "Проекты"),
        ("Трансформация", "Артефакт"),
        ("Трансформации", "Артефакты"),
    ],
    "ja-JP": [
        ("ノートブック", "プロジェクト"),
        ("変換", "アーティファクト"),
    ],
    "zh-CN": [
        ("笔记本", "项目"),
        ("转换", "工件"),
        ("变换", "工件"),
    ],
    "zh-TW": [
        ("筆記本", "專案"),
        ("轉換", "工件"),
        ("變換", "工件"),
    ],
    "bn-IN": [
        ("নোটবুক", "প্রকল্প"),
        ("রূপান্তর", "আর্টিফ্যাক্ট"),
    ],
}


def apply_key_renames(text: str) -> str:
    for old, new in KEY_RENAMES:
        text = text.replace(old, new)
    return text


def update_locale_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text
    locale_code = path.parent.name

    text = apply_key_renames(text)

    if locale_code == "en-US":
        for old, new in EN_US_VALUE_REPLACEMENTS:
            text = text.replace(old, new)
    elif locale_code in LOCALE_VALUE_SUBS:
        for old, new in LOCALE_VALUE_SUBS[locale_code]:
            text = text.replace(old, new)

    # Ensure navigation.artifacts uses localized-friendly label where still English
    if locale_code != "en-US":
        text = re.sub(
            r'(artifacts:\s*")Transformationen(")',
            r'\1Artefakte\2',
            text,
        )

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    updated = 0
    for path in sorted(LOCALES_DIR.glob("*/index.ts")):
        if update_locale_file(path):
            print(f"updated {path}")
            updated += 1
    print(f"Done. Updated {updated} locale files.")


if __name__ == "__main__":
    main()

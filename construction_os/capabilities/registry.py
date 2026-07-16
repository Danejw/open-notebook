"""Declarative registry of native Construction OS chat tools."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

from pydantic import BaseModel

from construction_os.capabilities import (
    artifact_templates as artifact_templates_mod,
    collections as collections_mod,
    context as context_mod,
    project_artifacts as project_artifacts_mod,
    retrieval as retrieval_mod,
    skills as skills_mod,
    templates as templates_mod,
    tools as tools_mod,
)
from construction_os.capabilities.models import CapabilityRuntimeContext

NativeHandler = Callable[..., Awaitable[Any]]

NATIVE_PREFIX = "native__"


class RegisteredNativeTool(BaseModel):
    name: str
    description: str
    access: str = "read"
    performed_write: bool = False
    input_model: type[BaseModel]
    handler: Any = None  # NativeHandler — excluded from serialization concerns

    model_config = {"arbitrary_types_allowed": True}


def runtime_name(tool_name: str) -> str:
    return f"{NATIVE_PREFIX}{tool_name}"


def display_name(runtime: str) -> str:
    if runtime.startswith(NATIVE_PREFIX):
        return runtime[len(NATIVE_PREFIX) :]
    return runtime


_REGISTRY: dict[str, RegisteredNativeTool] = {
    "get_project_context": RegisteredNativeTool(
        name="get_project_context",
        description=(
            "Return the active project and chat context: project metadata, "
            "source/Project Artifact counts, explicit skill/collection/tool/"
            "template selections, and relevant context configuration. "
            "Uses trusted server project/session — do not pass project IDs."
        ),
        input_model=context_mod.GetProjectContextInput,
        handler=context_mod.get_project_context,
    ),
    "search_project_knowledge": RegisteredNativeTool(
        name="search_project_knowledge",
        description=(
            "Search the current project's sources and Project Artifacts using "
            "hybrid/vector retrieval. Returns compact evidence with scores and "
            "provenance. Respects the user's context_config selection pool."
        ),
        input_model=retrieval_mod.SearchProjectKnowledgeInput,
        handler=retrieval_mod.search_project_knowledge,
    ),
    "list_skills": RegisteredNativeTool(
        name="list_skills",
        description=(
            "List available non-archived skills (catalog metadata only). "
            "Optional filters: query, name, description, tags, status."
        ),
        input_model=skills_mod.ListSkillsInput,
        handler=skills_mod.list_skills,
    ),
    "get_skill": RegisteredNativeTool(
        name="get_skill",
        description=(
            "Load a skill's SKILL.md (or a supporting file via relative_path). "
            "Does not persist the skill as a chat default. "
            "Rejects archived skills and path traversal."
        ),
        input_model=skills_mod.GetSkillInput,
        handler=skills_mod.get_skill,
    ),
    "list_collections": RegisteredNativeTool(
        name="list_collections",
        description=(
            "List available non-archived collections with item counts and "
            "use_when metadata. Does not load full collection contents."
        ),
        input_model=collections_mod.ListCollectionsInput,
        handler=collections_mod.list_collections,
    ),
    "get_collection": RegisteredNativeTool(
        name="get_collection",
        description=(
            "Load a collection in the same format used for chat prompt injection. "
            "Does not persist the collection as a chat default."
        ),
        input_model=collections_mod.GetCollectionInput,
        handler=collections_mod.get_collection,
    ),
    "list_tools": RegisteredNativeTool(
        name="list_tools",
        description=(
            "List external/MCP tools available in the application for discovery. "
            "Native Construction OS tools are NOT included (they are automatic). "
            "Discovery does not authorize execution — MCP tools require manual "
            "selection and allowlisting to execute."
        ),
        input_model=tools_mod.ListToolsInput,
        handler=tools_mod.list_tools,
    ),
    "get_tool": RegisteredNativeTool(
        name="get_tool",
        description=(
            "Get metadata and input schema for one external/MCP tool. "
            "Does not execute the tool. Secrets are never returned."
        ),
        input_model=tools_mod.GetToolInput,
        handler=tools_mod.get_tool,
    ),
    "list_templates": RegisteredNativeTool(
        name="list_templates",
        description=(
            "List available HTML templates (metadata only; no HTML body)."
        ),
        input_model=templates_mod.ListTemplatesInput,
        handler=templates_mod.list_templates,
    ),
    "get_templates": RegisteredNativeTool(
        name="get_templates",
        description=(
            "Retrieve one HTML template including body and structure metadata "
            "for generating outputs. Does not set it as the session default."
        ),
        input_model=templates_mod.GetTemplatesInput,
        handler=templates_mod.get_templates,
    ),
    "list_artifact_templates": RegisteredNativeTool(
        name="list_artifact_templates",
        description=(
            "List reusable artifact templates and their default skills, "
            "collections, MCP tools, and HTML template attachments. "
            "Does not activate a template."
        ),
        input_model=artifact_templates_mod.ListArtifactTemplatesInput,
        handler=artifact_templates_mod.list_artifact_templates,
    ),
    "run_artifact_template": RegisteredNativeTool(
        name="run_artifact_template",
        description=(
            "Execute an artifact template against input text and return the "
            "generated output without saving. Use save_project_artifact only "
            "when the user asks to save the result."
        ),
        input_model=artifact_templates_mod.RunArtifactTemplateInput,
        handler=artifact_templates_mod.run_artifact_template,
    ),
    "save_project_artifact": RegisteredNativeTool(
        name="save_project_artifact",
        description=(
            "Save content as a Project Artifact in the active project. "
            "ONLY call when the user directly asks to save, create, or preserve "
            "the output as a Project Artifact. This is the only native write tool."
        ),
        access="write",
        performed_write=True,
        input_model=project_artifacts_mod.SaveProjectArtifactInput,
        handler=project_artifacts_mod.save_project_artifact,
    ),
}

NATIVE_TOOL_NAMES: tuple[str, ...] = tuple(_REGISTRY.keys())


def get_native_tool_definition(name: str) -> Optional[RegisteredNativeTool]:
    return _REGISTRY.get(name)


def list_native_tool_definitions() -> list[RegisteredNativeTool]:
    return list(_REGISTRY.values())


def bindable_native_tools(ctx: CapabilityRuntimeContext) -> list[RegisteredNativeTool]:
    """Native tools available for the current runtime (excludes guest/disabled)."""
    if ctx.is_guest or not ctx.enable_native_tools:
        return []
    tools = list(_REGISTRY.values())
    if not ctx.allow_project_artifact_save:
        tools = [t for t in tools if t.name != "save_project_artifact"]
    return tools

import operator
from typing import Any, Dict, List, Optional

from content_core import extract_content
from content_core.common import ProcessSourceState
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from loguru import logger
from typing_extensions import Annotated, TypedDict

from construction_os.ai.models import Model, ModelManager
from construction_os.domain.content_settings import ContentSettings
from construction_os.domain.project import Asset, Source
from construction_os.domain.artifact import Artifact
from construction_os.graphs.artifact import graph as artifact_graph
from construction_os.knowledge.pipeline import (
    PIPELINE_EMBEDDING,
    PIPELINE_KNOWLEDGE_GRAPH,
    set_pipeline_stage,
    submit_auto_knowledge_graph,
)


class SourceState(TypedDict):
    content_state: ProcessSourceState
    apply_artifacts: List[Artifact]
    source_id: str
    project_ids: List[str]
    source: Source
    artifacts: Annotated[list, operator.add]
    embed: bool


class ApplyArtifactState(TypedDict):
    source: Source
    artifact: Artifact


async def content_process(state: SourceState) -> dict:
    content_settings = ContentSettings(
        default_content_processing_engine_doc="auto",
        default_content_processing_engine_url="auto",
        default_embedding_option="ask",
        auto_delete_files="yes",
        youtube_preferred_languages=[
            "en",
            "pt",
            "es",
            "de",
            "nl",
            "en-GB",
            "fr",
            "hi",
            "ja",
        ],
    )
    content_state: Dict[str, Any] = state["content_state"]  # type: ignore[assignment]

    content_state["url_engine"] = (
        content_settings.default_content_processing_engine_url or "auto"
    )
    content_state["document_engine"] = (
        content_settings.default_content_processing_engine_doc or "auto"
    )
    content_state["output_format"] = "markdown"

    # Add speech-to-text model configuration from Default Models
    try:
        model_manager = ModelManager()
        defaults = await model_manager.get_defaults()
        if defaults.default_speech_to_text_model:
            stt_model = await Model.get(defaults.default_speech_to_text_model)
            if stt_model:
                content_state["audio_provider"] = stt_model.provider
                content_state["audio_model"] = stt_model.name
                logger.debug(
                    f"Using speech-to-text model: {stt_model.provider}/{stt_model.name}"
                )
    except Exception as e:
        logger.warning(f"Failed to retrieve speech-to-text model configuration: {e}")
        # Continue without custom audio model (content-core will use its default)

    processed_state = await extract_content(content_state)

    # content-core signals a soft extraction failure (e.g. an unreachable or
    # invalid URL) by returning title="Error" and content prefixed with
    # "Failed to extract content:" instead of raising. Detect that sentinel and
    # raise so the job is marked failed and the source becomes retryable, rather
    # than being saved as a "completed" source whose body is the error string.
    if processed_state.title == "Error" and (processed_state.content or "").startswith(
        "Failed to extract content:"
    ):
        raise ValueError(
            "Could not extract content from this source. "
            "The URL or file may be unreachable, invalid, or in an unsupported format."
        )

    if not processed_state.content or not processed_state.content.strip():
        url = processed_state.url or ""
        if url and ("youtube.com" in url or "youtu.be" in url):
            raise ValueError(
                "Could not extract content from this YouTube video. "
                "No transcript or subtitles are available. "
                "Try configuring a Speech-to-Text model in Settings "
                "to transcribe the audio instead."
            )
        raise ValueError(
            "Could not extract any text content from this source. "
            "The content may be empty, inaccessible, or in an unsupported format."
        )

    return {"content_state": processed_state}


async def save_source(state: SourceState) -> dict:
    content_state = state["content_state"]

    # Get existing source using the provided source_id
    source = await Source.get(state["source_id"])
    if not source:
        raise ValueError(f"Source with ID {state['source_id']} not found")

    # Update the source with processed content
    source.asset = Asset(url=content_state.url, file_path=content_state.file_path)
    source.full_text = content_state.content

    # Preserve user-set title; only overwrite placeholder or empty titles
    if content_state.title and (not source.title or source.title == "Processing..."):
        source.title = content_state.title

    await source.save()

    # NOTE: Project associations are created by the API immediately for UI responsiveness
    # No need to create them here to avoid duplicate edges

    if state["embed"]:
        if source.full_text and source.full_text.strip():
            logger.debug("Embedding content for vector search")
            await set_pipeline_stage(str(source.id), PIPELINE_EMBEDDING)
            await source.vectorize()
        else:
            logger.warning(
                f"Source {source.id} has no text content to embed, skipping vectorization"
            )
            await set_pipeline_stage(str(source.id), PIPELINE_KNOWLEDGE_GRAPH)
            submit_auto_knowledge_graph(str(source.id), state.get("project_ids") or [])
    else:
        await set_pipeline_stage(str(source.id), PIPELINE_KNOWLEDGE_GRAPH)
        submit_auto_knowledge_graph(str(source.id), state.get("project_ids") or [])

    return {"source": source}


def trigger_artifacts(state: SourceState, config: RunnableConfig) -> List[Send]:
    if len(state["apply_artifacts"]) == 0:
        return []

    to_apply = state["apply_artifacts"]
    logger.debug(f"Applying artifacts {to_apply}")

    return [
        Send(
            "transform_content",
            {
                "source": state["source"],
                "artifact": artifact,
            },
        )
        for artifact in to_apply
    ]


async def transform_content(state: ApplyArtifactState) -> Optional[dict]:
    source = state["source"]
    artifact = state["artifact"]
    applied = await apply_artifact_to_source(source, artifact)
    if applied is None:
        return None
    output, artifact_name = applied
    return {
        "artifacts": [
            {
                "output": output,
                "artifact_name": artifact_name,
            }
        ]
    }


async def apply_artifact_to_source(
    source: Source,
    artifact: Artifact,
) -> Optional[tuple[str, str]]:
    """Run one artifact against source.full_text and queue a source insight."""
    content = source.full_text
    if not content or not content.strip():
        return None

    logger.debug(f"Applying artifact {artifact.name}")
    result = await artifact_graph.ainvoke(
        dict(input_text=content, artifact=artifact)  # type: ignore[arg-type]
    )
    await source.add_insight(artifact.title, result["output"])
    return result["output"], artifact.name


async def apply_artifacts_to_source(
    source: Source,
    artifacts: List[Artifact],
) -> int:
    """Run artifact templates against source content. Returns count applied."""
    applied = 0
    for artifact in artifacts:
        if await apply_artifact_to_source(source, artifact) is not None:
            applied += 1
    return applied


# Create and compile the workflow
workflow = StateGraph(SourceState)

# Add nodes
workflow.add_node("content_process", content_process)
workflow.add_node("save_source", save_source)
workflow.add_node("transform_content", transform_content)
# Define the graph edges
workflow.add_edge(START, "content_process")
workflow.add_edge("content_process", "save_source")
workflow.add_conditional_edges(
    "save_source", trigger_artifacts, ["transform_content"]
)
workflow.add_edge("transform_content", END)

# Compile the graph
source_graph = workflow.compile()

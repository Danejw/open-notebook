from ai_prompter import Prompter
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from construction_os.ai.provision import provision_langchain_model
from construction_os.domain.artifact import ArtifactTemplate, DefaultPrompts
from construction_os.domain.project import Source
from construction_os.exceptions import ConstructionOSError
from construction_os.utils import clean_thinking_content
from construction_os.utils.error_classifier import classify_error
from construction_os.utils.text_utils import extract_text_content


class ArtifactState(TypedDict):
    input_text: str
    source: Source
    artifact: ArtifactTemplate
    output: str


async def run_artifact(state: dict, config: RunnableConfig) -> dict:
    source_obj = state.get("source")
    source: Source = source_obj if isinstance(source_obj, Source) else None  # type: ignore[assignment]
    content = state.get("input_text")
    assert source or content, "No content to transform"
    artifact_template: ArtifactTemplate = state["artifact"]

    try:
        if not content:
            content = source.full_text
        artifact_template_text = artifact_template.prompt
        default_prompts: DefaultPrompts = DefaultPrompts(artifact_instructions=None)
        if default_prompts.artifact_instructions:
            artifact_template_text = (
                f"{default_prompts.artifact_instructions}\n\n{artifact_template_text}"
            )

        artifact_template_text = f"{artifact_template_text}\n\n# INPUT"

        system_prompt = Prompter(template_text=artifact_template_text).render(
            data=state
        )
        content_str = str(content) if content else ""
        payload = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=content_str),
        ]
        chain = await provision_langchain_model(
            str(payload),
            config.get("configurable", {}).get("model_id"),
            "artifact",
            max_tokens=8192,
        )

        response = await chain.ainvoke(payload)

        response_content = extract_text_content(response.content)
        cleaned_content = clean_thinking_content(response_content)

        return {
            "output": cleaned_content,
        }
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


agent_state = StateGraph(ArtifactState)
agent_state.add_node("agent", run_artifact)  # type: ignore[type-var]
agent_state.add_edge(START, "agent")
agent_state.add_edge("agent", END)
graph = agent_state.compile()

import operator
from typing import Annotated, List, Optional

from ai_prompter import Prompter
from langchain_core.output_parsers.pydantic import PydanticOutputParser
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from construction_os.ai.provision import provision_langchain_model
from construction_os.exceptions import ConstructionOSError
from construction_os.graphs.progress import aemit_agent_progress
from construction_os.knowledge.graph_projection import persist_query_run
from construction_os.retrieval import retrieve
from construction_os.retrieval.types import RetrievalMode
from construction_os.utils import clean_thinking_content
from construction_os.utils.error_classifier import classify_error
from construction_os.utils.text_utils import extract_text_content


class SubGraphState(TypedDict):
    question: str
    term: str
    instructions: str
    results: dict
    answer: str
    ids: list  # Added for provide_answer function
    evidence_paths: list


class Search(BaseModel):
    term: str
    instructions: str = Field(
        description="Tell the answeting LLM what information you need extracted from this search"
    )


class Strategy(BaseModel):
    reasoning: str
    searches: List[Search] = Field(
        default_factory=list,
        description="You can add up to five searches to this strategy",
    )


class ThreadState(TypedDict):
    question: str
    strategy: Strategy
    answers: Annotated[list, operator.add]
    final_answer: str
    evidence_paths: Annotated[list, operator.add]
    query_run_id: Optional[str]


def _config_project_id(config: RunnableConfig) -> Optional[str]:
    return config.get("configurable", {}).get("project_id")


def _config_retrieval_mode(config: RunnableConfig) -> RetrievalMode:
    mode = config.get("configurable", {}).get("retrieval_mode") or "auto"
    if mode not in ("auto", "vector", "hybrid", "graph"):
        return "auto"
    return mode  # type: ignore[return-value]


async def call_model_with_messages(state: ThreadState, config: RunnableConfig) -> dict:
    try:
        await aemit_agent_progress("started", "strategy", {}, config)
        parser = PydanticOutputParser(pydantic_object=Strategy)
        system_prompt = Prompter(prompt_template="ask/entry", parser=parser).render(  # type: ignore[arg-type]
            data=state  # type: ignore[arg-type]
        )
        model = await provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("strategy_model"),
            "tools",
            max_tokens=2000,
            structured=dict(type="json"),
        )
        # model = model.bind_tools(tools)
        # First get the raw response from the model
        ai_message = await model.ainvoke(system_prompt)

        # Clean the thinking content from the response
        message_content = extract_text_content(ai_message.content)
        cleaned_content = clean_thinking_content(message_content)

        # Parse the cleaned JSON content
        strategy = parser.parse(cleaned_content)

        await aemit_agent_progress(
            "completed",
            "strategy",
            {"searchQueries": len(strategy.searches)},
            config,
        )
        return {"strategy": strategy}
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


async def trigger_queries(state: ThreadState, config: RunnableConfig):
    return [
        Send(
            "provide_answer",
            {
                "question": state["question"],
                "instructions": s.instructions,
                "term": s.term,
            },
        )
        for s in state["strategy"].searches
    ]


async def provide_answer(state: SubGraphState, config: RunnableConfig) -> dict:
    try:
        term = state.get("term") or ""
        await aemit_agent_progress(
            "progress",
            "provide_answer",
            {"searchTerm": term},
            config,
        )
        payload = dict(state)
        bundle = await retrieve(
            term,
            project_id=_config_project_id(config),
            mode=_config_retrieval_mode(config),
            limit=10,
            search_sources=True,
            search_notes=True,
        )
        results = bundle.to_search_results()
        path_payload = [
            p.model_dump() for p in bundle.paths if p.nodes or p.description
        ]
        path_descriptions = [
            p.description or " → ".join(p.nodes)
            for p in bundle.paths
            if p.nodes or p.description
        ]
        if len(results) == 0:
            await aemit_agent_progress(
                "completed",
                "provide_answer",
                {"searchTerm": term, "resultCount": 0, "answerCount": 0},
                config,
            )
            return {"answers": [], "evidence_paths": path_payload or path_descriptions}
        payload["results"] = results
        ids = [r["id"] for r in results]
        payload["ids"] = ids
        payload["evidence_paths"] = path_descriptions
        system_prompt = Prompter(prompt_template="ask/query_process").render(data=payload)  # type: ignore[arg-type]
        model = await provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("answer_model"),
            "tools",
            max_tokens=2000,
        )
        ai_message = await model.ainvoke(system_prompt)
        ai_content = extract_text_content(ai_message.content)
        await aemit_agent_progress(
            "completed",
            "provide_answer",
            {
                "searchTerm": term,
                "resultCount": len(results),
                "answerCount": 1,
                "retrievalMode": bundle.retrieval_mode_used,
                "evidencePathCount": len(path_descriptions),
            },
            config,
        )
        return {
            "answers": [clean_thinking_content(ai_content)],
            "evidence_paths": path_payload or path_descriptions,
        }
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


async def write_final_answer(state: ThreadState, config: RunnableConfig) -> dict:
    try:
        answer_count = len(state.get("answers") or [])
        await aemit_agent_progress(
            "started",
            "write_final_answer",
            {
                "answerCount": answer_count,
                "evidencePathCount": len(state.get("evidence_paths") or []),
            },
            config,
        )
        system_prompt = Prompter(prompt_template="ask/final_answer").render(
            data={
                **state,
                "evidence_paths": [
                    (
                        p.get("description")
                        or " → ".join(p.get("nodes") or [])
                        if isinstance(p, dict)
                        else str(p)
                    )
                    for p in (state.get("evidence_paths") or [])
                ],
            }
        )  # type: ignore[arg-type]
        model = await provision_langchain_model(
            system_prompt,
            config.get("configurable", {}).get("final_answer_model"),
            "tools",
            max_tokens=2000,
        )
        ai_message = await model.ainvoke(system_prompt)
        final_content = extract_text_content(ai_message.content)

        query_run_id = None
        project_id = _config_project_id(config)
        if project_id:
            try:
                raw_paths = state.get("evidence_paths") or []
                path_payload = []
                entity_ids = set()
                chunk_ids = set()
                source_ids = set()
                for p in raw_paths:
                    if isinstance(p, dict):
                        path_payload.append(p)
                        entity_ids.update(p.get("nodes") or [])
                        chunk_ids.update(p.get("chunk_ids") or [])
                        source_ids.update(p.get("source_ids") or [])
                    elif isinstance(p, str) and p:
                        path_payload.append(
                            {"description": p, "nodes": [], "edges": []}
                        )

                run = await persist_query_run(
                    project_id=project_id,
                    query=state.get("question") or "",
                    retrieval_mode=_config_retrieval_mode(config),
                    seeds={
                        "entity_ids": [
                            e
                            for e in entity_ids
                            if str(e).startswith("kg_entity:")
                        ],
                        "chunk_ids": list(chunk_ids),
                    },
                    paths=path_payload,
                    cited_ids={
                        "source_ids": list(source_ids),
                        "chunk_ids": list(chunk_ids),
                        "entity_ids": [
                            e
                            for e in entity_ids
                            if str(e).startswith("kg_entity:")
                        ],
                        "relation_ids": [],
                    },
                    metadata={"answer_count": answer_count},
                )
                query_run_id = str(run.id)
            except Exception:
                query_run_id = None

        await aemit_agent_progress(
            "completed",
            "write_final_answer",
            {
                "answerCount": answer_count,
                "queryRunId": query_run_id,
            },
            config,
        )
        return {
            "final_answer": clean_thinking_content(final_content),
            "query_run_id": query_run_id,
        }
    except ConstructionOSError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


agent_state = StateGraph(ThreadState)
agent_state.add_node("strategy", call_model_with_messages)
agent_state.add_node("provide_answer", provide_answer)
agent_state.add_node("write_final_answer", write_final_answer)
agent_state.add_edge(START, "strategy")
agent_state.add_conditional_edges("strategy", trigger_queries, ["provide_answer"])
agent_state.add_edge("provide_answer", "write_final_answer")
agent_state.add_edge("write_final_answer", END)

# In-memory checkpointer required for ag-ui-langgraph (aget_state); Ask threads are ephemeral.
graph = agent_state.compile(checkpointer=MemorySaver())

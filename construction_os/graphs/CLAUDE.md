# Graphs Module

LangGraph-based workflow orchestration for content processing, chat interactions, and AI-powered artifacts.

## Key Components

- **`chat.py`**: Conversational agent with message history, project context, and model override support
- **`source.py`**: Content ingestion pipeline (extract → save → apply artifacts with content-core)
- **`artifact.py`**: Single-node artifact executor with prompt templating via ai_prompter
- **`prompt.py`**: Generic pattern chain for arbitrary prompt-based LLM calls
- **`checkpointer.py`**: Shared AsyncSqliteSaver lifecycle for chat graphs
- **`tools.py`**: Minimal tool library (currently just `get_current_timestamp()`)

## Important Patterns

- **Async/sync bridging in graphs**: `chat.py` uses `asyncio.new_event_loop()` workaround because LangGraph nodes are sync but `provision_langchain_model()` is async
- **State machines via StateGraph**: Each graph compiles to stateful runnable; conditional edges fan out work (source.py does parallel artifact runs)
- **Prompt templating**: `ai_prompter.Prompter` with Jinja2 templates referenced by path ("chat/system", etc.)
- **Model provisioning via context**: Config dict passed to node via `RunnableConfig`; defaults fall back to state overrides
- **Checkpointing**: `chat.py` uses AsyncSqliteSaver for message history (LangGraph's built-in persistence)
- **Content extraction**: `source.py` uses content-core library with provider/model from DefaultModels; URLs and files both supported

## Error Handling in Graphs

All graph nodes use `classify_error()` from `construction_os.utils.error_classifier` to catch raw LLM provider exceptions and re-raise them as typed `ConstructionOSError` subclasses with user-friendly messages. This ensures that errors from any AI provider (authentication failures, rate limits, model not found, network issues) are surfaced to the user with actionable messages instead of opaque stack traces.

**Pattern in nodes**:
```python
from construction_os.utils.error_classifier import classify_error

try:
    result = await model.ainvoke(...)
except Exception as e:
    exc_class, message = classify_error(e)
    raise exc_class(message) from e
```

---

## Quirks & Edge Cases

- **Async loop gymnastics**: ThreadPoolExecutor workaround needed because LangGraph invokes sync nodes but we call async functions; fragile if event loop state changes
- **`clean_thinking_content()` ubiquitous**: Strips `<think>...</think>` tags from model responses (handles extended thinking models)
- **source.py embedding is async**: `source.vectorize()` returns job command ID; not awaited (fire-and-forget)
- **artifact.py nullable source**: Accepts `input_text` or `source.full_text` (falls back to second if first missing)
- **AsyncSqliteSaver location**: Checkpoints stored in path from `LANGGRAPH_CHECKPOINT_FILE` env var; connection shared across graphs

## Key Dependencies

- `langgraph`: StateGraph, Send, END, START, AsyncSqliteSaver checkpoint persistence
- `langchain_core`: Messages, OutputParser, RunnableConfig
- `ai_prompter`: Prompter for Jinja2 template rendering
- `content_core`: `extract_content()` for file/URL processing
- `construction_os.ai.provision`: `provision_langchain_model()` (async factory with fallback logic)
- `construction_os.utils.error_classifier`: `classify_error()` for user-friendly LLM error messages
- `construction_os.domain.project`: Domain models (Source, Note, vector_search)
- `construction_os.domain.artifact`: Artifact model for artifact graph and source fan-out
- `loguru`: Logging

## Usage Example

```python
# Invoke a graph with config override
config = {"configurable": {"model_id": "model:custom_id"}}
result = await chat_graph.ainvoke(
    {"messages": [HumanMessage(content="...")], "project": project, "project_id": "project:123"},
    config=config
)

# Source processing (content → save → apply artifacts)
result = await source_graph.ainvoke({
    "content_state": {...},  # ProcessSourceState from content-core
    "apply_artifacts": [artifact1, artifact2],
    "project_ids": ["project:abc"],
    "source_id": "source:123",
    "embed": True
})
```

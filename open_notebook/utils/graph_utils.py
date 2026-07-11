from langchain_core.messages import RemoveMessage
from langchain_core.runnables import RunnableConfig
from loguru import logger

from open_notebook.exceptions import NotFoundError


async def get_session_message_count(graph, session_id: str) -> int:
    """Get message count from LangGraph state, returns 0 on error."""
    try:
        thread_state = await graph.aget_state(
            config=RunnableConfig(configurable={"thread_id": session_id}),
        )
        if (
            thread_state
            and thread_state.values
            and "messages" in thread_state.values
        ):
            return len(thread_state.values["messages"])
    except Exception as e:
        logger.warning(f"Could not fetch message count for session {session_id}: {e}")
    return 0


async def truncate_messages_from_id(
    graph,
    session_id: str,
    message_id: str,
) -> None:
    """Remove a message and all subsequent messages from LangGraph session state."""
    config = RunnableConfig(configurable={"thread_id": session_id})
    thread_state = await graph.aget_state(config=config)

    messages = []
    if thread_state and thread_state.values:
        messages = thread_state.values.get("messages", [])

    edit_index = None
    for index, message in enumerate(messages):
        if getattr(message, "id", None) == message_id:
            edit_index = index
            break

    if edit_index is None:
        raise NotFoundError(f"Message {message_id} not found")

    if getattr(messages[edit_index], "type", None) != "human":
        raise ValueError("Only human messages can be edited")

    messages_to_remove = messages[edit_index:]
    remove_updates = [
        RemoveMessage(id=message.id)
        for message in messages_to_remove
        if getattr(message, "id", None)
    ]

    if remove_updates:
        await graph.aupdate_state(
            config,
            {"messages": remove_updates},
        )

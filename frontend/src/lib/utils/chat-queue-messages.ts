import type { ChatQueueResponse } from '@/lib/types/chat-queue'
import type { SourceChatMessage } from '@/lib/types/api'

/**
 * Adds reconnectable optimistic rows for the active persisted queue iteration.
 * Only surfaces turns after the worker claims them (`running`) so pending items
 * do not look like they already entered chat before the API runs.
 */
export function mergeActiveQueueMessages<T extends SourceChatMessage>(
  messages: T[],
  queue: ChatQueueResponse | undefined
): T[] {
  const item =
    queue?.current_item ??
    queue?.items.find((candidate) => candidate.status === 'running')
  if (!item || item.status !== 'running') {
    return messages
  }

  const iteration = Math.max(1, item.current_loop)
  const humanId = `queue-human:${item.id}:${iteration}`
  const aiId = `queue-ai:${item.id}:${iteration}`
  const hasHuman = messages.some((message) => message.id === humanId)
  const hasAi = messages.some((message) => message.id === aiId)
  if (hasHuman && (hasAi || !item.stream_content)) {
    return messages
  }

  const additions: SourceChatMessage[] = []
  if (!hasHuman) {
    additions.push({
      id: humanId,
      type: 'human',
      content: item.prompt,
      timestamp: item.started_at ?? item.created,
    })
  }
  if (item.stream_content && !hasAi) {
    additions.push({
      id: aiId,
      type: 'ai',
      content: item.stream_content,
      timestamp: item.updated,
    })
  }

  return [...messages, ...additions] as T[]
}

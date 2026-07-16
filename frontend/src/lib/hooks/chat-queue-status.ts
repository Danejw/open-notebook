import type { ChatQueueItemResponse, ChatQueueResponse } from '@/lib/types/chat-queue'

/** Resolve the queue item currently driving stream UI (running turn). */
export function getQueueCurrentItem(
  queue: ChatQueueResponse | undefined
): ChatQueueItemResponse | undefined {
  return (
    queue?.current_item ??
    queue?.items.find((item) => item.status === 'running')
  )
}

/** Prefer queue stream progress message over live AG-UI stream status. */
export function deriveQueueStreamStatus(
  queueCurrentItem: ChatQueueItemResponse | undefined,
  streamStatus: string | null
): string | null {
  const queueMessage = queueCurrentItem?.stream_progress?.message
  return typeof queueMessage === 'string' ? queueMessage : streamStatus
}

/** Extract activity log lines from queue stream events, falling back to live log. */
export function deriveQueueActivityLog(
  queueCurrentItem: ChatQueueItemResponse | undefined,
  activityLog: string[]
): string[] {
  const events = queueCurrentItem?.stream_activity?.events
  if (!Array.isArray(events)) {
    return activityLog
  }

  return events
    .map((event) =>
      event &&
      typeof event === 'object' &&
      'message' in event &&
      typeof event.message === 'string'
        ? event.message
        : null
    )
    .filter((event): event is string => event !== null)
}

export interface DeriveQueueHasWorkOptions {
  /** When true, failed items count as active queue work (project chat). */
  includeFailed?: boolean
}

/** True when the queue has visible pending/running (and optionally failed) work. */
export function deriveQueueHasWork(
  queue: ChatQueueResponse | undefined,
  options: DeriveQueueHasWorkOptions = {}
): boolean {
  const { includeFailed = false } = options
  return Boolean(
    queue?.items.some(
      (item) =>
        item.status === 'pending' ||
        item.status === 'running' ||
        (includeFailed && item.status === 'failed')
    )
  )
}

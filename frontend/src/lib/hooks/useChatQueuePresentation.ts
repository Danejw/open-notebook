'use client'

import { useMemo } from 'react'
import type { ChatQueueResponse } from '@/lib/types/chat-queue'
import {
  deriveQueueActivityLog,
  deriveQueueHasWork,
  deriveQueueStreamStatus,
  getQueueCurrentItem,
} from '@/lib/hooks/chat-queue-status'
import { mergeActiveQueueMessages } from '@/lib/utils/chat-queue-messages'

export interface UseChatQueuePresentationOptions<TMessage> {
  messages: TMessage[]
  queue: ChatQueueResponse | undefined
  streamStatus: string | null
  activityLog: string[]
  /**
   * When true, failed queue items count as active work.
   * Project and source chat both use includeFailed: true for consistent UX.
   */
  includeFailed?: boolean
}

/**
 * Shared queue presentation wiring: merged messages, stream status, activity log.
 */
export function useChatQueuePresentation<TMessage>({
  messages,
  queue,
  streamStatus,
  activityLog,
  includeFailed = true,
}: UseChatQueuePresentationOptions<TMessage>) {
  const queueMessages = useMemo(
    () => mergeActiveQueueMessages(messages, queue),
    [messages, queue]
  )
  const queueCurrentItem = getQueueCurrentItem(queue)
  const queueStreamStatus = deriveQueueStreamStatus(queueCurrentItem, streamStatus)
  const queueActivityLog = deriveQueueActivityLog(queueCurrentItem, activityLog)
  const queueHasWork = deriveQueueHasWork(queue, { includeFailed })

  return {
    queueMessages,
    queueCurrentItem,
    queueStreamStatus,
    queueActivityLog,
    queueHasWork,
  }
}

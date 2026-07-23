import { arrayMove } from '@dnd-kit/sortable'
import type {
  ChatQueueItemResponse,
  ChatQueueItemStatus,
} from '@/lib/types/chat-queue'

export function shortItemId(itemId: string): string {
  return itemId.includes(':') ? itemId.slice(itemId.indexOf(':') + 1) : itemId
}

export function queueStatusKey(status: ChatQueueItemStatus): string {
  switch (status) {
    case 'pending':
      return 'chat.queueStatusPending'
    case 'running':
      return 'chat.queueStatusRunning'
    case 'completed':
      return 'chat.queueStatusCompleted'
    case 'failed':
      return 'chat.queueStatusFailed'
    case 'cancelled':
      return 'chat.queueStatusCancelled'
    default: {
      const exhaustiveStatus: never = status
      return exhaustiveStatus
    }
  }
}

/**
 * Returns a pending-item order after one pointer or keyboard drag.
 */
export function reorderPendingItemIds(
  itemIds: string[],
  activeId: string,
  overId: string
): string[] {
  const activeIndex = itemIds.indexOf(activeId)
  const overIndex = itemIds.indexOf(overId)
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return itemIds
  }
  return arrayMove(itemIds, activeIndex, overIndex)
}

/**
 * Queue panel only lists prompts that have not started yet, plus failures
 * so users can retry/delete. Running items leave the list when claimed.
 */
export function isQueuedForPanel(status: ChatQueueItemStatus): boolean {
  switch (status) {
    case 'pending':
    case 'failed':
      return true
    case 'running':
    case 'completed':
    case 'cancelled':
      return false
    default: {
      const exhaustiveStatus: never = status
      return exhaustiveStatus
    }
  }
}

/**
 * FIFO display order: lowest position first (top), matching drain order.
 */
export function compareQueueItemFifo(
  left: ChatQueueItemResponse,
  right: ChatQueueItemResponse
): number {
  const positionDifference = left.position - right.position
  if (positionDifference !== 0) {
    return positionDifference
  }
  return left.id.localeCompare(right.id)
}

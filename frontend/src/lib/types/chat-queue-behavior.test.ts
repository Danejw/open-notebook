import { describe, expect, it } from 'vitest'
import {
  getNextPendingQueueItem,
  shouldRecoverIdleChatQueue,
} from '@/lib/hooks/useChatRuntime'
import { makeChatQueue, makeQueueItem } from '@/lib/test-fixtures/chat-queue'
import { shouldDeferChatToQueue } from '@/lib/types/chat-queue'

describe('shouldDeferChatToQueue', () => {
  it('defers only while a turn is streaming', () => {
    const pendingQueue = makeChatQueue({
      items: [makeQueueItem({ status: 'pending' })],
    })
    expect(shouldDeferChatToQueue(true)).toBe(true)
    expect(shouldDeferChatToQueue(true, pendingQueue)).toBe(true)
    expect(shouldDeferChatToQueue(false)).toBe(false)
    expect(shouldDeferChatToQueue(false, pendingQueue)).toBe(false)
  })

  it('ignores queue item status when idle', () => {
    const busyLookingQueue = makeChatQueue({
      items: [
        makeQueueItem({ id: 'a', status: 'pending', position: 0 }),
        makeQueueItem({ id: 'b', status: 'running', position: 1 }),
        makeQueueItem({ id: 'c', status: 'failed', position: 2 }),
      ],
    })
    expect(shouldDeferChatToQueue(false, busyLookingQueue)).toBe(false)
  })
})

describe('getNextPendingQueueItem', () => {
  it('returns the lowest-position visible pending item', () => {
    const next = getNextPendingQueueItem([
      makeQueueItem({
        id: 'chat_queue_item:late',
        position: 2,
        status: 'pending',
        prompt: 'Later',
      }),
      makeQueueItem({
        id: 'chat_queue_item:first',
        position: 0,
        status: 'pending',
        prompt: 'First',
      }),
      makeQueueItem({
        id: 'chat_queue_item:mid',
        position: 1,
        status: 'pending',
        prompt: 'Middle',
      }),
    ])
    expect(next?.id).toBe('chat_queue_item:first')
  })

  it('skips non-pending and invisible items', () => {
    const next = getNextPendingQueueItem([
      makeQueueItem({
        id: 'chat_queue_item:running',
        position: 0,
        status: 'running',
      }),
      makeQueueItem({
        id: 'chat_queue_item:hidden',
        position: 1,
        status: 'pending',
        visible: false,
      }),
      makeQueueItem({
        id: 'chat_queue_item:ready',
        position: 2,
        status: 'pending',
        prompt: 'Ready',
      }),
    ])
    expect(next?.id).toBe('chat_queue_item:ready')
  })

  it('returns null when there is no pending work', () => {
    expect(getNextPendingQueueItem([])).toBeNull()
    expect(
      getNextPendingQueueItem([
        makeQueueItem({ status: 'completed' }),
        makeQueueItem({ id: 'r', status: 'running', position: 1 }),
      ])
    ).toBeNull()
  })
})

describe('shouldRecoverIdleChatQueue', () => {
  it('returns true only for active queues with visible pending items while idle', () => {
    expect(
      shouldRecoverIdleChatQueue(
        {
          status: 'active',
          items: [{ visible: true, status: 'pending' }],
        },
        false
      )
    ).toBe(true)
    expect(
      shouldRecoverIdleChatQueue(
        {
          status: 'active',
          items: [{ visible: true, status: 'pending' }],
        },
        true
      )
    ).toBe(false)
    expect(
      shouldRecoverIdleChatQueue(
        {
          status: 'paused',
          items: [{ visible: true, status: 'pending' }],
        },
        false
      )
    ).toBe(false)
    expect(
      shouldRecoverIdleChatQueue(
        {
          status: 'active',
          items: [{ visible: true, status: 'running' }],
        },
        false
      )
    ).toBe(false)
  })
})

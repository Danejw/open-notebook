import { describe, expect, it } from 'vitest'
import {
  compareQueueItemFifo,
  isQueuedForPanel,
  queueStatusKey,
  reorderPendingItemIds,
  shortItemId,
} from '@/components/source/chat-queue/queueUtils'
import { makeQueueItem } from '@/lib/test-fixtures/chat-queue'

describe('chat-queue/queueUtils', () => {
  it('shortItemId strips table prefix', () => {
    expect(shortItemId('chat_queue_item:abc')).toBe('abc')
    expect(shortItemId('plain')).toBe('plain')
  })

  it('queueStatusKey covers every status', () => {
    expect(queueStatusKey('pending')).toBe('chat.queueStatusPending')
    expect(queueStatusKey('running')).toBe('chat.queueStatusRunning')
    expect(queueStatusKey('completed')).toBe('chat.queueStatusCompleted')
    expect(queueStatusKey('failed')).toBe('chat.queueStatusFailed')
    expect(queueStatusKey('cancelled')).toBe('chat.queueStatusCancelled')
  })

  it('isQueuedForPanel only keeps pending and failed', () => {
    expect(isQueuedForPanel('pending')).toBe(true)
    expect(isQueuedForPanel('failed')).toBe(true)
    expect(isQueuedForPanel('running')).toBe(false)
    expect(isQueuedForPanel('completed')).toBe(false)
    expect(isQueuedForPanel('cancelled')).toBe(false)
  })

  it('compareQueueItemFifo sorts by position then id', () => {
    const a = makeQueueItem({ id: 'chat_queue_item:b', position: 2 })
    const b = makeQueueItem({ id: 'chat_queue_item:a', position: 1 })
    const c = makeQueueItem({ id: 'chat_queue_item:c', position: 1 })
    expect([a, b, c].sort(compareQueueItemFifo).map((i) => i.id)).toEqual([
      'chat_queue_item:a',
      'chat_queue_item:c',
      'chat_queue_item:b',
    ])
  })

  it('reorderPendingItemIds moves active over target', () => {
    expect(reorderPendingItemIds(['one', 'two', 'three'], 'three', 'one')).toEqual([
      'three',
      'one',
      'two',
    ])
  })
})

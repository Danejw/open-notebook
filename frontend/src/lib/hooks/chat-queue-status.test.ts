import { describe, it, expect } from 'vitest'
import type {
  ChatQueueItemResponse,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'
import {
  deriveQueueActivityLog,
  deriveQueueHasWork,
  deriveQueueStreamStatus,
  getQueueCurrentItem,
} from './chat-queue-status'

function makeItem(
  overrides: Partial<ChatQueueItemResponse> = {}
): ChatQueueItemResponse {
  return {
    id: 'item-1',
    queue_id: 'queue-1',
    chat_session: 'session-1',
    client_request_id: 'req-1',
    run_id: 'run-1',
    position: 0,
    status: 'pending',
    visible: true,
    prompt: 'Hello',
    loop_count: 1,
    current_loop: 1,
    iteration_token: null,
    execution_snapshot: {
      model_id: null,
      skill_ids: null,
      tool_ids: null,
      html_template_id: null,
      artifact_id: null,
      context_config: null,
      forwarded_props: null,
    },
    runner_command_id: null,
    runner_state: 'idle',
    stream_revision: 0,
    stream_content: '',
    stream_progress: null,
    stream_activity: null,
    error_type: null,
    error_message: null,
    error_details: null,
    started_at: null,
    completed_at: null,
    failed_at: null,
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeQueue(
  items: ChatQueueItemResponse[],
  currentItem: ChatQueueItemResponse | null = null
): ChatQueueResponse {
  return {
    id: 'queue-1',
    chat_session: 'session-1',
    status: 'active',
    revision: 1,
    runner_state: 'idle',
    runner_command_id: null,
    lease_owner: null,
    lease_expires_at: null,
    items,
    current_item: currentItem,
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
  }
}

describe('getQueueCurrentItem', () => {
  it('returns current_item when set', () => {
    const running = makeItem({ id: 'running', status: 'running' })
    const queue = makeQueue([makeItem()], running)
    expect(getQueueCurrentItem(queue)?.id).toBe('running')
  })

  it('falls back to first running item', () => {
    const running = makeItem({ id: 'running', status: 'running' })
    const queue = makeQueue([makeItem(), running], null)
    expect(getQueueCurrentItem(queue)?.id).toBe('running')
  })

  it('returns undefined when queue is empty or idle', () => {
    expect(getQueueCurrentItem(undefined)).toBeUndefined()
    expect(getQueueCurrentItem(makeQueue([makeItem()]))).toBeUndefined()
  })
})

describe('deriveQueueStreamStatus', () => {
  it('prefers queue stream progress message', () => {
    const item = makeItem({
      stream_progress: { message: 'Queue thinking...' },
    })
    expect(deriveQueueStreamStatus(item, 'Live status')).toBe('Queue thinking...')
  })

  it('falls back to live stream status', () => {
    const item = makeItem({ stream_progress: { message: 42 } })
    expect(deriveQueueStreamStatus(item, 'Live status')).toBe('Live status')
    expect(deriveQueueStreamStatus(undefined, 'Live status')).toBe('Live status')
  })
})

describe('deriveQueueActivityLog', () => {
  it('maps queue stream activity events to strings', () => {
    const item = makeItem({
      stream_activity: {
        events: [
          { message: 'Step 1' },
          { message: 'Step 2' },
          { ignored: true },
        ],
      },
    })
    expect(deriveQueueActivityLog(item, ['live'])).toEqual(['Step 1', 'Step 2'])
  })

  it('falls back to live activity log', () => {
    expect(deriveQueueActivityLog(undefined, ['live'])).toEqual(['live'])
    expect(deriveQueueActivityLog(makeItem(), ['live'])).toEqual(['live'])
  })
})

describe('deriveQueueHasWork', () => {
  it('detects pending and running items', () => {
    const queue = makeQueue([
      makeItem({ status: 'completed' }),
      makeItem({ id: 'pending', status: 'pending' }),
    ])
    expect(deriveQueueHasWork(queue)).toBe(true)
  })

  it('optionally includes failed items', () => {
    const queue = makeQueue([makeItem({ status: 'failed' })])
    expect(deriveQueueHasWork(queue)).toBe(false)
    expect(deriveQueueHasWork(queue, { includeFailed: true })).toBe(true)
  })

  it('returns false for empty or completed queues', () => {
    expect(deriveQueueHasWork(undefined)).toBe(false)
    expect(
      deriveQueueHasWork(makeQueue([makeItem({ status: 'completed' })]))
    ).toBe(false)
  })
})

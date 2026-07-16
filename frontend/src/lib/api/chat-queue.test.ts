import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChatQueueHttpError,
  chatQueueApi,
  consumeChatQueueSseBuffer,
  parseChatQueueResponse,
} from '@/lib/api/chat-queue'
import apiClient, { handleUnauthorizedResponse } from '@/lib/api/client'
import type {
  ChatQueueItemResponse,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return {
    ...actual,
    default: {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    },
    handleUnauthorizedResponse: vi.fn(() => {
      localStorage.removeItem('auth-storage')
    }),
  }
})

const mockedApiClient = vi.mocked(apiClient)
const mockedHandleUnauthorizedResponse = vi.mocked(handleUnauthorizedResponse)

function makeItem(
  overrides: Partial<ChatQueueItemResponse> = {}
): ChatQueueItemResponse {
  return {
    id: 'chat_queue_item:item-1',
    queue_id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    client_request_id: 'request-1',
    run_id: 'run-1',
    position: 0,
    status: 'pending',
    visible: true,
    prompt: 'Build a schedule',
    loop_count: 1,
    current_loop: 0,
    iteration_token: null,
    execution_snapshot: {
      model_id: null,
      skill_ids: [],
      tool_ids: [],
      html_template_id: null,
      artifact_id: null,
      context_config: {},
      forwarded_props: {},
    },
    runner_command_id: null,
    runner_state: 'idle',
    stream_revision: 1,
    stream_content: '',
    stream_progress: null,
    stream_activity: null,
    error_type: null,
    error_message: null,
    error_details: null,
    started_at: null,
    completed_at: null,
    failed_at: null,
    created: '2026-07-15T00:00:00Z',
    updated: '2026-07-15T00:00:00Z',
    ...overrides,
  }
}

function makeQueue(
  overrides: Partial<ChatQueueResponse> = {}
): ChatQueueResponse {
  const items = overrides.items ?? [makeItem()]
  return {
    id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    status: 'active',
    revision: 1,
    runner_state: 'scheduled',
    runner_command_id: 'command-1',
    lease_owner: null,
    lease_expires_at: null,
    items,
    current_item: null,
    created: '2026-07-15T00:00:00Z',
    updated: '2026-07-15T00:00:00Z',
    ...overrides,
  }
}

function sseResponse(frames: string): Response {
  return new Response(frames, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('chatQueueApi REST methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the session queue endpoint for every operation', async () => {
    const queue = makeQueue()
    const item = makeItem()
    mockedApiClient.get.mockResolvedValueOnce({ data: queue })
    mockedApiClient.post
      .mockResolvedValueOnce({ data: item })
      .mockResolvedValueOnce({ data: item })
    mockedApiClient.patch
      .mockResolvedValueOnce({ data: item })
      .mockResolvedValueOnce({ data: queue })
      .mockResolvedValueOnce({ data: queue })
    mockedApiClient.put.mockResolvedValueOnce({ data: queue })
    mockedApiClient.delete.mockResolvedValueOnce({ data: undefined })

    await chatQueueApi.get('session-1')
    await chatQueueApi.enqueue('session-1', {
      client_request_id: 'request-1',
      prompt: 'Build a schedule',
      loop_count: 1,
    })
    await chatQueueApi.updateItem('session-1', 'item-1', {
      prompt: 'Build a detailed schedule',
    })
    await chatQueueApi.deleteItem('session-1', 'item-1')
    await chatQueueApi.reorder('session-1', {
      item_ids: ['item-1'],
      expected_revision: 1,
    })
    await chatQueueApi.pause('session-1')
    await chatQueueApi.resume('session-1')
    await chatQueueApi.retry('session-1', 'item-1')

    expect(mockedApiClient.get).toHaveBeenCalledWith(
      '/chat/sessions/session-1/queue'
    )
    expect(mockedApiClient.post).toHaveBeenNthCalledWith(
      1,
      '/chat/sessions/session-1/queue/items',
      expect.objectContaining({ client_request_id: 'request-1' })
    )
    expect(mockedApiClient.patch).toHaveBeenNthCalledWith(
      1,
      '/chat/sessions/session-1/queue/items/item-1',
      { prompt: 'Build a detailed schedule' }
    )
    expect(mockedApiClient.delete).toHaveBeenCalledWith(
      '/chat/sessions/session-1/queue/items/item-1'
    )
    expect(mockedApiClient.put).toHaveBeenCalledWith(
      '/chat/sessions/session-1/queue/order',
      { item_ids: ['item-1'], expected_revision: 1 }
    )
    expect(mockedApiClient.patch).toHaveBeenNthCalledWith(
      2,
      '/chat/sessions/session-1/queue',
      { status: 'paused' }
    )
    expect(mockedApiClient.patch).toHaveBeenNthCalledWith(
      3,
      '/chat/sessions/session-1/queue',
      { status: 'active' }
    )
    expect(mockedApiClient.post).toHaveBeenNthCalledWith(
      2,
      '/chat/sessions/session-1/queue/items/item-1/retry'
    )
  })
})

describe('queue response parsing', () => {
  it('accepts the complete backend response shape', () => {
    expect(parseChatQueueResponse(makeQueue())).toEqual(makeQueue())
  })

  it('rejects unknown statuses and missing required fields', () => {
    expect(() =>
      parseChatQueueResponse({ ...makeQueue(), status: 'stopped' })
    ).toThrow()
    expect(() =>
      parseChatQueueResponse({ ...makeQueue(), revision: undefined })
    ).toThrow()
  })

  it('rejects datetimes that are not ISO values', () => {
    expect(() =>
      parseChatQueueResponse({ ...makeQueue(), created: 'July 15, 2026' })
    ).toThrow()
    expect(() =>
      parseChatQueueResponse({
        ...makeQueue(),
        items: [makeItem({ completed_at: '2026-07-15 00:01:00' })],
      })
    ).toThrow()
  })

  it('accepts ISO datetimes with or without a timezone offset', () => {
    expect(
      parseChatQueueResponse({
        ...makeQueue(),
        created: '2026-07-15T00:00:00.123456',
        updated: '2026-07-15T00:00:00+00:00',
      }).created
    ).toBe('2026-07-15T00:00:00.123456')
  })
})

describe('queue SSE parsing', () => {
  it('parses CRLF frames, event IDs, and multiline data', () => {
    const queue = makeQueue({ revision: 7 })
    const json = JSON.stringify({
      event: 'snapshot',
      revision: 7,
      queue,
      item: null,
    })
    const splitAt = json.indexOf('"revision"')
    const frame =
      `id: 7\r\nevent: snapshot\r\ndata: ${json.slice(0, splitAt)}\r\n` +
      `data: ${json.slice(splitAt)}\r\n\r\n`
    const onEvent = vi.fn()

    const remaining = consumeChatQueueSseBuffer(frame, onEvent)

    expect(remaining).toBe('')
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'snapshot', revision: 7, queue }),
      { eventName: 'snapshot', id: '7' }
    )
  })

  it('keeps incomplete frames and ignores comments and malformed payloads', () => {
    const onEvent = vi.fn()
    const partial = 'id: 2\nevent: heartbeat\ndata: {"event":"heartbeat"'

    const remaining = consumeChatQueueSseBuffer(
      `: keepalive\n\ndata: not-json\n\n${partial}`,
      onEvent
    )

    expect(remaining).toBe(partial)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('rejects payloads whose event shape does not match the discriminator', () => {
    const onEvent = vi.fn()
    const invalid = JSON.stringify({
      event: 'item',
      revision: 3,
      queue: null,
      item: null,
    })

    consumeChatQueueSseBuffer(`id: 3\ndata: ${invalid}\n\n`, onEvent)

    expect(onEvent).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'missing event field',
      frame: (data: string) => `id: 3\ndata: ${data}\n\n`,
    },
    {
      name: 'nonnumeric ID',
      frame: (data: string) => `id: three\nevent: heartbeat\ndata: ${data}\n\n`,
    },
    {
      name: 'noncanonical numeric ID',
      frame: (data: string) => `id: 03\nevent: heartbeat\ndata: ${data}\n\n`,
    },
    {
      name: 'revision mismatch',
      frame: (data: string) => `id: 4\nevent: heartbeat\ndata: ${data}\n\n`,
    },
    {
      name: 'event discriminator mismatch',
      frame: (data: string) => `id: 3\nevent: queue\ndata: ${data}\n\n`,
    },
  ])('isolates $name and continues with the next frame', ({ frame }) => {
    const heartbeat = JSON.stringify({
      event: 'heartbeat',
      revision: 3,
      queue: null,
      item: null,
    })
    const valid =
      `id: 5\nevent: heartbeat\ndata: ${JSON.stringify({
        event: 'heartbeat',
        revision: 5,
        queue: null,
        item: null,
      })}\n\n`
    const onEvent = vi.fn()

    consumeChatQueueSseBuffer(`${frame(heartbeat)}${valid}`, onEvent)

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 5 }),
      { eventName: 'heartbeat', id: '5' }
    )
  })

  it('propagates application callback failures', () => {
    const heartbeat = JSON.stringify({
      event: 'heartbeat',
      revision: 3,
      queue: null,
      item: null,
    })

    expect(() =>
      consumeChatQueueSseBuffer(
        `id: 3\nevent: heartbeat\ndata: ${heartbeat}\n\n`,
        () => {
          throw new Error('consumer failed')
        }
      )
    ).toThrow('consumer failed')
  })
})

describe('queue SSE reconnects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { token: 'secret-token' } })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('reconnects with the latest revision in the query and Last-Event-ID', async () => {
    const controller = new AbortController()
    const firstQueue = makeQueue({ revision: 4 })
    const secondQueue = makeQueue({ revision: 5 })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse(
          `id: 4\nevent: snapshot\ndata: ${JSON.stringify({
            event: 'snapshot',
            revision: 4,
            queue: firstQueue,
            item: null,
          })}\n\n`
        )
      )
      .mockResolvedValueOnce(
        sseResponse(
          `id: 5\nevent: queue\ndata: ${JSON.stringify({
            event: 'queue',
            revision: 5,
            queue: secondQueue,
            item: null,
          })}\n\n`
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const streamPromise = chatQueueApi.stream(
      'session-1',
      (event) => {
        if (event.revision === 5) controller.abort()
      },
      {
        afterRevision: 3,
        signal: controller.signal,
        reconnectBaseDelayMs: 10,
        reconnectMaxDelayMs: 20,
      }
    )
    await vi.advanceTimersByTimeAsync(10)
    await streamPromise

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chat/sessions/session-1/queue/stream?after_revision=3',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer secret-token',
        }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/sessions/session-1/queue/stream?after_revision=4',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Last-Event-ID': '4' }),
      })
    )
  })

  it('stops immediately on abort without retrying', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      chatQueueApi.stream('session-1', vi.fn(), {
        signal: controller.signal,
      })
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caps exponential retry delays at the configured maximum', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 4) {
        controller.abort()
      }
      throw new TypeError('network unavailable')
    })
    vi.stubGlobal('fetch', fetchMock)

    const streamPromise = chatQueueApi.stream('session-1', vi.fn(), {
      signal: controller.signal,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 20,
    })
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(20)
    await vi.advanceTimersByTimeAsync(20)
    await streamPromise

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('rejects a successful response with a non-SSE content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    await expect(
      chatQueueApi.stream('session-1', vi.fn())
    ).rejects.toMatchObject({
      name: 'ChatQueueHttpError',
      retryable: false,
    })
  })

  it.each([401, 403])(
    'surfaces HTTP %s without retrying',
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: `HTTP ${status}` }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        chatQueueApi.stream('session-1', vi.fn())
      ).rejects.toEqual(
        expect.objectContaining<Partial<ChatQueueHttpError>>({
          status,
          retryable: false,
        })
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('auth-storage') === null).toBe(status === 401)
      expect(mockedHandleUnauthorizedResponse).toHaveBeenCalledTimes(
        status === 401 ? 1 : 0
      )
    }
  )
})

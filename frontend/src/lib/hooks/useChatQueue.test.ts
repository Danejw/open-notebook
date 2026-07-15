import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatQueueHttpError, chatQueueApi } from '@/lib/api/chat-queue'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  applyChatQueueStreamEvent,
  mergeChatQueueState,
  shouldStreamQueue,
  useChatQueue,
} from '@/lib/hooks/useChatQueue'
import type {
  ChatQueueItemResponse,
  ChatQueueResponse,
  ChatQueueStreamEvent,
} from '@/lib/types/chat-queue'

vi.mock('@/lib/api/chat-queue', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/api/chat-queue')
  >()
  return {
    ...actual,
    chatQueueApi: {
      deleteItem: vi.fn(),
      enqueue: vi.fn(),
      get: vi.fn(),
      pause: vi.fn(),
      reorder: vi.fn(),
      resume: vi.fn(),
      retry: vi.fn(),
      stream: vi.fn(),
      updateItem: vi.fn(),
    },
  }
})

const mockedQueueApi = vi.mocked(chatQueueApi)

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
    prompt: 'First prompt',
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
  const items = overrides.items ?? [
    makeItem(),
    makeItem({
      id: 'chat_queue_item:item-2',
      client_request_id: 'request-2',
      run_id: 'run-2',
      position: 1,
      prompt: 'Second prompt',
    }),
  ]
  return {
    id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    status: 'active',
    revision: 8,
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

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    createElement(QueryClientProvider, { client: queryClient }, children)
  )
  return { queryClient, wrapper }
}

function pendingPromise<T>(): Promise<T> {
  return new Promise(() => undefined)
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function streamEmitter() {
  let emit: ((event: ChatQueueStreamEvent) => void) | undefined
  mockedQueueApi.stream.mockImplementation(
    async (_sessionId, onEvent) => {
      emit = (event) =>
        onEvent(event, { eventName: event.event, id: `${event.revision}` })
      return pendingPromise()
    }
  )
  return {
    emit: (event: ChatQueueStreamEvent) => {
      if (!emit) {
        throw new Error('Stream is not connected')
      }
      emit(event)
    },
    isConnected: () => emit !== undefined,
  }
}

describe('queue query keys and query lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedQueueApi.stream.mockResolvedValue(undefined)
  })

  it('does not query without a session ID', () => {
    const { queryClient, wrapper } = createHarness()

    const { result } = renderHook(() => useChatQueue(null), { wrapper })

    expect(result.current.queue).toBeUndefined()
    expect(mockedQueueApi.get).not.toHaveBeenCalled()
    expect(
      queryClient.getQueryState(QUERY_KEYS.chatQueue(''))
    ).toBeUndefined()
  })

  it('uses isolated canonical keys for each session', async () => {
    const first = makeQueue()
    const second = makeQueue({
      id: 'chat_queue:queue-2',
      chat_session: 'chat_session:session-2',
    })
    mockedQueueApi.get.mockImplementation(async (sessionId) =>
      sessionId === 'session-1' ? first : second
    )
    const { queryClient, wrapper } = createHarness()

    const firstHook = renderHook(() => useChatQueue('session-1'), { wrapper })
    const secondHook = renderHook(() => useChatQueue('session-2'), { wrapper })
    await waitFor(() => expect(firstHook.result.current.queue).toEqual(first))
    await waitFor(() => expect(secondHook.result.current.queue).toEqual(second))

    expect(queryClient.getQueryData(QUERY_KEYS.chatQueue('session-1'))).toEqual(
      first
    )
    expect(queryClient.getQueryData(QUERY_KEYS.chatQueue('session-2'))).toEqual(
      second
    )
    expect(QUERY_KEYS.sourceChatSessions('source-1')).toEqual([
      'sourceChatSessions',
      'source-1',
    ])
    expect(QUERY_KEYS.sourceChatSession('source-1', 'session-1')).toEqual([
      'sourceChatSession',
      'source-1',
      'session-1',
    ])
  })

  it('does not let a stale refetch overwrite a newer cached revision', async () => {
    const newer = makeQueue({ revision: 10, status: 'paused' })
    const stale = makeQueue({ revision: 9, status: 'active' })
    mockedQueueApi.get
      .mockResolvedValueOnce(newer)
      .mockResolvedValueOnce(stale)
    const { queryClient, wrapper } = createHarness()
    const { result } = renderHook(() => useChatQueue('session-1'), { wrapper })
    await waitFor(() => expect(result.current.queue).toEqual(newer))

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.chatQueue('session-1'),
      })
    })

    expect(mockedQueueApi.get).toHaveBeenCalledTimes(2)
    expect(result.current.queue).toEqual(newer)
  })
})

describe('queue mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedQueueApi.get.mockResolvedValue(makeQueue())
    mockedQueueApi.stream.mockImplementation(() => pendingPromise())
  })

  it('reuses one generated client request ID when enqueue retries', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    )
    mockedQueueApi.enqueue
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(makeItem())
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useChatQueue('session-1'), { wrapper })
    await waitFor(() => expect(result.current.queue).toBeDefined())

    await act(async () => {
      await result.current.enqueue({
        prompt: 'A stable request',
        loop_count: 1,
      })
    })

    expect(mockedQueueApi.enqueue).toHaveBeenCalledTimes(2)
    const firstPayload = mockedQueueApi.enqueue.mock.calls[0][1]
    const secondPayload = mockedQueueApi.enqueue.mock.calls[1][1]
    expect(firstPayload.client_request_id).toBe(
      '00000000-0000-4000-8000-000000000001'
    )
    expect(secondPayload.client_request_id).toBe(
      firstPayload.client_request_id
    )
  })

  it.each([
    {
      name: 'edit',
      arrange: (promise: Promise<never>) =>
        mockedQueueApi.updateItem.mockReturnValue(promise),
      mutate: (hook: ReturnType<typeof useChatQueue>) =>
        hook.editItem('chat_queue_item:item-1', {
          prompt: 'Optimistic prompt',
        }),
      assertOptimistic: (queue: ChatQueueResponse) =>
        expect(queue.items[0].prompt).toBe('Optimistic prompt'),
    },
    {
      name: 'delete',
      arrange: (promise: Promise<never>) =>
        mockedQueueApi.deleteItem.mockReturnValue(promise),
      mutate: (hook: ReturnType<typeof useChatQueue>) =>
        hook.deleteItem('chat_queue_item:item-1'),
      assertOptimistic: (queue: ChatQueueResponse) =>
        expect(queue.items.map((item) => item.id)).toEqual([
          'chat_queue_item:item-2',
        ]),
    },
    {
      name: 'reorder',
      arrange: (promise: Promise<never>) =>
        mockedQueueApi.reorder.mockReturnValue(promise),
      mutate: (hook: ReturnType<typeof useChatQueue>) =>
        hook.reorder([
          'chat_queue_item:item-2',
          'chat_queue_item:item-1',
        ]),
      assertOptimistic: (queue: ChatQueueResponse) =>
        expect(queue.items.map((item) => item.id)).toEqual([
          'chat_queue_item:item-2',
          'chat_queue_item:item-1',
        ]),
    },
    {
      name: 'pause',
      arrange: (promise: Promise<never>) =>
        mockedQueueApi.pause.mockReturnValue(promise),
      mutate: (hook: ReturnType<typeof useChatQueue>) => hook.pause(),
      assertOptimistic: (queue: ChatQueueResponse) =>
        expect(queue.status).toBe('paused'),
    },
  ])(
    'optimistically applies and rolls back $name',
    async ({ arrange, mutate, assertOptimistic }) => {
      const initial = makeQueue()
      mockedQueueApi.get.mockResolvedValue(initial)
      const operation = deferred<never>()
      arrange(operation.promise)
      const { queryClient, wrapper } = createHarness()
      const { result } = renderHook(() => useChatQueue('session-1'), {
        wrapper,
      })
      await waitFor(() => expect(result.current.queue).toEqual(initial))

      let mutationPromise: Promise<unknown> | undefined
      act(() => {
        mutationPromise = mutate(result.current)
      })
      await waitFor(() => {
        const optimistic = queryClient.getQueryData<ChatQueueResponse>(
          QUERY_KEYS.chatQueue('session-1')
        )
        expect(optimistic).toBeDefined()
        assertOptimistic(optimistic!)
      })

      operation.reject(new Error('failed'))
      await act(async () => {
        await expect(mutationPromise).rejects.toThrow('failed')
      })
      await waitFor(() =>
        expect(
          queryClient.getQueryData(QUERY_KEYS.chatQueue('session-1'))
        ).toEqual(initial)
      )
    }
  )

  it('rolls an optimistic edit back and refetches on conflict', async () => {
    const initial = makeQueue()
    const refreshed = makeQueue({
      revision: 9,
      items: [makeItem({ prompt: 'Server prompt', stream_revision: 9 })],
    })
    mockedQueueApi.get
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(refreshed)
    mockedQueueApi.updateItem.mockRejectedValue(
      Object.assign(new Error('stale'), { response: { status: 409 } })
    )
    const { queryClient, wrapper } = createHarness()
    const { result } = renderHook(() => useChatQueue('session-1'), { wrapper })
    await waitFor(() => expect(result.current.queue).toEqual(initial))

    await act(async () => {
      await expect(
        result.current.editItem('chat_queue_item:item-1', {
          prompt: 'Local prompt',
        })
      ).rejects.toThrow('stale')
    })

    await waitFor(() =>
      expect(
        queryClient.getQueryData<ChatQueueResponse>(
          QUERY_KEYS.chatQueue('session-1')
        )
      ).toEqual(refreshed)
    )
    expect(mockedQueueApi.get).toHaveBeenCalledTimes(2)
  })

  it('sends the exact pending order with the captured queue revision', async () => {
    mockedQueueApi.reorder.mockResolvedValue(
      makeQueue({ revision: 9 })
    )
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useChatQueue('session-1'), { wrapper })
    await waitFor(() => expect(result.current.queue).toBeDefined())

    await act(async () => {
      await result.current.reorder([
        'chat_queue_item:item-2',
        'chat_queue_item:item-1',
      ])
    })

    expect(mockedQueueApi.reorder).toHaveBeenCalledWith('session-1', {
      item_ids: ['chat_queue_item:item-2', 'chat_queue_item:item-1'],
      expected_revision: 8,
    })
  })

  it('preserves a newer SSE revision when an older mutation succeeds', async () => {
    const operation = deferred<ChatQueueItemResponse>()
    mockedQueueApi.updateItem.mockReturnValue(operation.promise)
    const emitter = streamEmitter()
    const { queryClient, wrapper } = createHarness()
    const { result } = renderHook(() => useChatQueue('session-1'), { wrapper })
    await waitFor(() => expect(emitter.isConnected()).toBe(true))

    let mutationPromise: Promise<ChatQueueItemResponse> | undefined
    act(() => {
      mutationPromise = result.current.editItem('chat_queue_item:item-1', {
        prompt: 'Optimistic prompt',
      })
    })
    await waitFor(() =>
      expect(
        queryClient.getQueryData<ChatQueueResponse>(
          QUERY_KEYS.chatQueue('session-1')
        )?.items[0].prompt
      ).toBe('Optimistic prompt')
    )

    act(() => {
      emitter.emit({
        event: 'item',
        revision: 10,
        queue: null,
        item: makeItem({
          prompt: 'Newest stream prompt',
          stream_revision: 10,
        }),
      })
    })
    operation.resolve(
      makeItem({ prompt: 'Older mutation prompt', stream_revision: 9 })
    )
    await act(async () => {
      await mutationPromise
    })

    expect(
      queryClient.getQueryData<ChatQueueResponse>(
        QUERY_KEYS.chatQueue('session-1')
      )
    ).toEqual(
      expect.objectContaining({
        revision: 10,
        items: expect.arrayContaining([
          expect.objectContaining({ prompt: 'Newest stream prompt' }),
        ]),
      })
    )
  })

  it('does not roll back over cache that advanced past the mutation base', async () => {
    const operation = deferred<ChatQueueItemResponse>()
    mockedQueueApi.updateItem.mockReturnValue(operation.promise)
    const emitter = streamEmitter()
    const { queryClient, wrapper } = createHarness()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useChatQueue('session-1'), { wrapper })
    await waitFor(() => expect(emitter.isConnected()).toBe(true))

    let mutationPromise: Promise<ChatQueueItemResponse> | undefined
    act(() => {
      mutationPromise = result.current.editItem('chat_queue_item:item-1', {
        prompt: 'Optimistic prompt',
      })
    })
    await waitFor(() =>
      expect(
        queryClient.getQueryData<ChatQueueResponse>(
          QUERY_KEYS.chatQueue('session-1')
        )?.items[0].prompt
      ).toBe('Optimistic prompt')
    )
    act(() => {
      emitter.emit({
        event: 'item',
        revision: 10,
        queue: null,
        item: makeItem({
          prompt: 'Advanced stream prompt',
          stream_revision: 10,
        }),
      })
    })
    operation.reject(new Error('mutation failed'))
    await act(async () => {
      await expect(mutationPromise).rejects.toThrow('mutation failed')
    })

    expect(
      queryClient.getQueryData<ChatQueueResponse>(
        QUERY_KEYS.chatQueue('session-1')
      )
    ).toEqual(
      expect.objectContaining({
        revision: 10,
        items: expect.arrayContaining([
          expect.objectContaining({ prompt: 'Advanced stream prompt' }),
        ]),
      })
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: QUERY_KEYS.chatQueue('session-1'),
    })
  })

  it('rejects an optimistic reorder if cache advances after cancellation', async () => {
    const advanced = makeQueue({ revision: 9 })
    const { queryClient, wrapper } = createHarness()
    const originalCancel = queryClient.cancelQueries.bind(queryClient)
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(async (filters) => {
      await originalCancel(filters)
      queryClient.setQueryData(QUERY_KEYS.chatQueue('session-1'), advanced)
    })
    const { result } = renderHook(() => useChatQueue('session-1'), { wrapper })
    await waitFor(() => expect(result.current.queue?.revision).toBe(8))

    await act(async () => {
      await expect(
        result.current.reorder([
          'chat_queue_item:item-2',
          'chat_queue_item:item-1',
        ])
      ).rejects.toThrow('Queue changed before reorder')
    })

    expect(mockedQueueApi.reorder).not.toHaveBeenCalled()
    expect(
      queryClient.getQueryData(QUERY_KEYS.chatQueue('session-1'))
    ).toEqual(advanced)
  })

  it('applies a completed mutation to its original session after switching', async () => {
    const operation = deferred<ChatQueueItemResponse>()
    mockedQueueApi.updateItem.mockReturnValue(operation.promise)
    mockedQueueApi.get.mockImplementation(async (sessionId) =>
      makeQueue({
        id: `chat_queue:${sessionId}`,
        chat_session: `chat_session:${sessionId}`,
      })
    )
    const { queryClient, wrapper } = createHarness()
    const { result, rerender } = renderHook(
      ({ sessionId }) => useChatQueue(sessionId),
      { initialProps: { sessionId: 'session-1' }, wrapper }
    )
    await waitFor(() => expect(result.current.queue).toBeDefined())

    let mutationPromise: Promise<ChatQueueItemResponse> | undefined
    act(() => {
      mutationPromise = result.current.editItem('chat_queue_item:item-1', {
        prompt: 'Session one edit',
      })
    })
    rerender({ sessionId: 'session-2' })
    await waitFor(() =>
      expect(result.current.queue?.chat_session).toBe('chat_session:session-2')
    )
    operation.resolve(
      makeItem({
        chat_session: 'chat_session:session-1',
        prompt: 'Session one result',
        stream_revision: 9,
      })
    )
    await act(async () => {
      await mutationPromise
    })

    expect(
      queryClient.getQueryData<ChatQueueResponse>(
        QUERY_KEYS.chatQueue('session-1')
      )?.items[0].prompt
    ).toBe('Session one result')
    expect(
      queryClient.getQueryData<ChatQueueResponse>(
        QUERY_KEYS.chatQueue('session-2')
      )?.items[0].prompt
    ).toBe('First prompt')
  })
})

describe('stream cache hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores duplicate and stale revisions in the pure cache updater', () => {
    const current = makeQueue({ revision: 8 })
    const stale: ChatQueueStreamEvent = {
      event: 'queue',
      revision: 7,
      queue: makeQueue({ revision: 7, status: 'paused' }),
      item: null,
    }

    expect(applyChatQueueStreamEvent(current, stale)).toBe(current)
  })

  it('uses one revision-aware merge for snapshots, items, and events', () => {
    const current = makeQueue({ revision: 8 })
    const staleSnapshot = makeQueue({ revision: 7, status: 'paused' })
    const newerItem = makeItem({ stream_revision: 9, prompt: 'Merged item' })

    expect(
      mergeChatQueueState(current, {
        kind: 'snapshot',
        queue: staleSnapshot,
      })
    ).toBe(current)
    expect(
      mergeChatQueueState(current, {
        kind: 'item',
        item: newerItem,
      })
    ).toEqual(
      expect.objectContaining({
        revision: 9,
        items: expect.arrayContaining([
          expect.objectContaining({ prompt: 'Merged item' }),
        ]),
      })
    )
  })

  it.each([
    {
      name: 'paused scheduled runner',
      queue: makeQueue({ status: 'paused', runner_state: 'scheduled' }),
      expected: true,
    },
    {
      name: 'paused running runner',
      queue: makeQueue({ status: 'paused', runner_state: 'running' }),
      expected: true,
    },
    {
      name: 'paused idle runner with running item',
      queue: makeQueue({
        status: 'paused',
        runner_state: 'idle',
        items: [makeItem({ status: 'running' })],
      }),
      expected: true,
    },
    {
      name: 'paused idle queue with only pending work',
      queue: makeQueue({ status: 'paused', runner_state: 'idle' }),
      expected: false,
    },
  ])('decides streaming for $name', ({ queue, expected }) => {
    expect(shouldStreamQueue(queue)).toBe(expected)
  })

  it('hydrates a newer item event while preserving ordered queue state', () => {
    const current = makeQueue({ revision: 8 })
    const changed = makeItem({
      id: 'chat_queue_item:item-2',
      position: 0,
      status: 'running',
      runner_state: 'running',
      stream_revision: 9,
    })
    const event: ChatQueueStreamEvent = {
      event: 'item',
      revision: 9,
      queue: null,
      item: changed,
    }

    const next = applyChatQueueStreamEvent(current, event)

    expect(next?.revision).toBe(9)
    expect(next?.items[0]).toEqual(changed)
    expect(next?.current_item).toEqual(changed)
  })

  it('hydrates reconnect events into the canonical query cache', async () => {
    const initial = makeQueue({ revision: 8 })
    const reconnected = makeQueue({ revision: 12, status: 'paused' })
    mockedQueueApi.get.mockResolvedValue(initial)
    mockedQueueApi.stream.mockImplementation(
      async (_sessionId, onEvent, options) => {
        onEvent({
          event: 'snapshot',
          revision: 12,
          queue: reconnected,
          item: null,
        }, { eventName: 'snapshot', id: '12' })
        options?.signal?.dispatchEvent(new Event('test-complete'))
      }
    )
    const { queryClient, wrapper } = createHarness()

    renderHook(() => useChatQueue('session-1'), { wrapper })

    await waitFor(() =>
      expect(
        queryClient.getQueryData(QUERY_KEYS.chatQueue('session-1'))
      ).toEqual(reconnected)
    )
    expect(mockedQueueApi.stream).toHaveBeenCalledWith(
      'session-1',
      expect.any(Function),
      expect.objectContaining({ afterRevision: 8 })
    )
  })

  it('notifies and invalidates history when running work completes', async () => {
    const runningItem = makeItem({
      status: 'running',
      runner_state: 'running',
      stream_revision: 8,
    })
    const initial = makeQueue({
      revision: 8,
      runner_state: 'running',
      items: [runningItem],
      current_item: runningItem,
    })
    mockedQueueApi.get.mockResolvedValue(initial)
    let emit: ((event: ChatQueueStreamEvent) => void) | undefined
    mockedQueueApi.stream.mockImplementation(
      async (_sessionId, onEvent) => {
        emit = (event) =>
          onEvent(event, { eventName: event.event, id: `${event.revision}` })
        return pendingPromise()
      }
    )
    const onCompletion = vi.fn()
    const historyKey = QUERY_KEYS.projectChatSession('session-1')
    const { queryClient, wrapper } = createHarness()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(
      () =>
        useChatQueue('session-1', {
          historyQueryKeys: [historyKey],
          onCompletion,
        }),
      { wrapper }
    )
    await waitFor(() => expect(emit).toBeDefined())

    act(() => {
      emit?.({
        event: 'item',
        revision: 9,
        queue: null,
        item: {
          ...runningItem,
          status: 'completed',
          runner_state: 'completed',
          stream_revision: 9,
          completed_at: '2026-07-15T00:01:00Z',
        },
      })
    })

    await waitFor(() =>
      expect(onCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'item-completed' })
      )
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: historyKey })
  })

  it('dedupes coalesced completions and separately reports full drain', async () => {
    const first = makeItem({ status: 'pending', stream_revision: 8 })
    const second = makeItem({
      id: 'chat_queue_item:item-2',
      client_request_id: 'request-2',
      run_id: 'run-2',
      position: 1,
      status: 'pending',
      stream_revision: 8,
    })
    const initial = makeQueue({
      revision: 8,
      runner_state: 'running',
      items: [first, second],
    })
    mockedQueueApi.get.mockResolvedValue(initial)
    const emitter = streamEmitter()
    const onCompletion = vi.fn()
    const { wrapper } = createHarness()
    renderHook(
      () => useChatQueue('session-1', { onCompletion }),
      { wrapper }
    )
    await waitFor(() => expect(emitter.isConnected()).toBe(true))

    const firstCompleted = {
      ...first,
      status: 'completed' as const,
      runner_state: 'completed' as const,
      stream_revision: 9,
      completed_at: '2026-07-15T00:01:00Z',
    }
    const firstEvent: ChatQueueStreamEvent = {
      event: 'item',
      revision: 9,
      queue: null,
      item: firstCompleted,
    }
    act(() => {
      emitter.emit(firstEvent)
      emitter.emit(firstEvent)
    })
    await waitFor(() => expect(onCompletion).toHaveBeenCalledTimes(1))
    expect(onCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'item-completed',
        item: expect.objectContaining({ id: first.id }),
      })
    )

    const drained = makeQueue({
      revision: 10,
      runner_state: 'idle',
      runner_command_id: null,
      items: [
        firstCompleted,
        {
          ...second,
          status: 'completed',
          runner_state: 'completed',
          stream_revision: 10,
          completed_at: '2026-07-15T00:02:00Z',
        },
      ],
    })
    const drainEvent: ChatQueueStreamEvent = {
      event: 'queue',
      revision: 10,
      queue: drained,
      item: null,
    }
    act(() => {
      emitter.emit(drainEvent)
      emitter.emit(drainEvent)
    })

    await waitFor(() => expect(onCompletion).toHaveBeenCalledTimes(3))
    expect(onCompletion.mock.calls.map(([completion]) => completion.type)).toEqual([
      'item-completed',
      'item-completed',
      'queue-drained',
    ])
  })

  it('exposes terminal stream failures and supports controlled restart', async () => {
    const terminalError = new ChatQueueHttpError('Forbidden', 403)
    mockedQueueApi.get.mockResolvedValue(makeQueue())
    mockedQueueApi.stream.mockRejectedValue(terminalError)
    const onStreamError = vi.fn()
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useChatQueue('session-1', { onStreamError }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.streamError).toBe(terminalError))
    expect(onStreamError).toHaveBeenCalledWith(terminalError)

    act(() => {
      result.current.restartStream()
    })
    await waitFor(() => expect(mockedQueueApi.stream).toHaveBeenCalledTimes(2))
  })

  it('aborts the old stream on session switch and on unmount', async () => {
    mockedQueueApi.get.mockImplementation(async (sessionId) =>
      makeQueue({
        id: `chat_queue:${sessionId}`,
        chat_session: `chat_session:${sessionId}`,
      })
    )
    const signals: AbortSignal[] = []
    mockedQueueApi.stream.mockImplementation(
      async (_sessionId, _onEvent, options) => {
        if (options?.signal) signals.push(options.signal)
        return pendingPromise()
      }
    )
    const { wrapper } = createHarness()
    const { rerender, unmount } = renderHook(
      ({ sessionId }) => useChatQueue(sessionId),
      { initialProps: { sessionId: 'session-1' }, wrapper }
    )
    await waitFor(() => expect(signals).toHaveLength(1))

    rerender({ sessionId: 'session-2' })
    await waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[0].aborted).toBe(true)

    unmount()
    expect(signals[1].aborted).toBe(true)
  })
})

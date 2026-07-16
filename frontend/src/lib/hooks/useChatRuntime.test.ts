import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryKey } from '@tanstack/react-query'
import { makeChatQueue, makeQueueItem } from '@/lib/test-fixtures/chat-queue'
import type { ChatQueueResponse } from '@/lib/types/chat-queue'
import { useChatRuntime } from './useChatRuntime'
import type { ChatStreamMessage } from './chat-sse-handlers'

const {
  mockSendMessage,
  mockEnqueueMessage,
  mockEnsureSession,
  mockBuildSendRequest,
  mockBuildEnqueuePayload,
  mockDeleteItem,
  mockPause,
  mockResume,
  mockRestartStream,
  queueState,
  sendTurnState,
} = vi.hoisted(() => {
  // Placeholder filled in beforeEach — vi.hoisted cannot call imported helpers.
  const queueState: { queue: ChatQueueResponse } = {
    queue: null as unknown as ChatQueueResponse,
  }
  const sendTurnState: {
    onTurnComplete: ((sessionId: string) => Promise<void>) | null
    isSending: boolean
  } = {
    onTurnComplete: null,
    isSending: false,
  }
  return {
    mockSendMessage: vi.fn().mockResolvedValue(undefined),
    mockEnqueueMessage: vi.fn(),
    mockEnsureSession: vi.fn(),
    mockBuildSendRequest: vi.fn(),
    mockBuildEnqueuePayload: vi.fn(),
    mockDeleteItem: vi.fn().mockResolvedValue(undefined),
    mockPause: vi.fn().mockResolvedValue(undefined),
    mockResume: vi.fn().mockResolvedValue(undefined),
    mockRestartStream: vi.fn(),
    queueState,
    sendTurnState,
  }
})

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  )
  return {
    ...actual,
    useQueryClient: () => ({
      prefetchQuery: vi.fn(),
      invalidateQueries: vi.fn(),
    }),
    useQuery: vi.fn(({ queryKey }: { queryKey: QueryKey }) => {
      if (Array.isArray(queryKey) && queryKey.includes('session-detail')) {
        return {
          data: {
            id: 'session-1',
            model_override: 'model-a',
            messages: [],
          },
          refetch: vi.fn(),
        }
      }
      return {
        data: [{ id: 'session-1' }],
        isLoading: false,
        refetch: vi.fn(),
      }
    }),
  }
})

vi.mock('@/lib/hooks/useChatStreamingBuffer', () => ({
  useChatStreamingBuffer: () => ({
    streamStatus: 'streaming',
    activityLog: ['step-1'],
    liveMcpToolCalls: [],
    streamContentRef: { current: new Map() },
    streamRafRef: { current: null },
    flushStreamingContent: vi.fn(),
    clearStreamingBuffers: vi.fn(),
    appendStreamingDelta: vi.fn(),
    setStreamStatus: vi.fn(),
    setActivityLog: vi.fn(),
    setLiveMcpToolCalls: vi.fn(),
  }),
}))

vi.mock('@/lib/hooks/useChatQueue', () => ({
  useChatQueue: () => ({
    get queue() {
      return queueState.queue
    },
    streamError: null,
    pause: mockPause,
    resume: mockResume,
    editItem: vi.fn(),
    deleteItem: mockDeleteItem,
    retryItem: vi.fn(),
    reorder: vi.fn(),
    ensureRunner: vi.fn(),
    restartStream: mockRestartStream,
    enqueueForSession: vi.fn(),
  }),
}))

vi.mock('@/lib/hooks/useChatSessionSelection', () => ({
  useChatSessionSelection: vi.fn(),
}))

vi.mock('@/lib/hooks/useChatSkillSelection', () => ({
  useChatSkillSelection: () => ({
    selectedSkillIds: ['skill-1'],
    selectedCollectionIds: [],
    selectedHtmlTemplateId: 'template-1',
    selectedMcpToolIds: ['tool-1'],
    selectedSkillIdsRef: { current: ['skill-1'] },
    selectedCollectionIdsRef: { current: [] as string[] },
    selectedHtmlTemplateIdRef: { current: 'template-1' as string | null },
    selectedMcpToolIdsRef: { current: ['tool-1'] },
    setSelectedSkillIds: vi.fn(),
    setSelectedCollectionIds: vi.fn(),
    setSelectedHtmlTemplateId: vi.fn(),
    setSelectedMcpToolIds: vi.fn(),
    clearPending: vi.fn(),
    clearPendingOnSessionCreated: vi.fn(),
  }),
}))

vi.mock('@/lib/hooks/useChatSessionMutations', () => ({
  useChatSessionMutations: () => ({
    updateSessionMutation: { mutate: vi.fn() },
    createSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    switchSession: vi.fn(),
  }),
}))

vi.mock('@/lib/hooks/useChatSendTurn', () => ({
  useChatSendTurn: (options: {
    buildSendRequest: typeof mockBuildSendRequest
    onTurnComplete?: (sessionId: string) => Promise<void>
  }) => {
    mockBuildSendRequest.mockImplementation(options.buildSendRequest)
    sendTurnState.onTurnComplete = options.onTurnComplete ?? null
    return {
      sendMessage: mockSendMessage,
      isSending: sendTurnState.isSending,
      cancelSending: vi.fn(),
    }
  },
}))

vi.mock('@/lib/hooks/useChatEnqueueMessage', () => ({
  applyAutoCreatedSessionSideEffects: () => vi.fn(),
  useChatEnqueueMessage: (options: {
    buildEnqueuePayload: typeof mockBuildEnqueuePayload
  }) => {
    mockBuildEnqueuePayload.mockImplementation(options.buildEnqueuePayload)
    return { enqueueMessage: mockEnqueueMessage }
  },
}))

vi.mock('@/lib/hooks/useChatQueuePresentation', () => ({
  useChatQueuePresentation: () => ({
    queueMessages: [{ id: 'queue-msg', type: 'ai', content: 'queued' }],
    queueCurrentItem: { id: 'item-1' },
    queueStreamStatus: 'queue-stream',
    queueActivityLog: ['queue-step'],
    queueHasWork: true,
  }),
}))

vi.mock('@/lib/hooks/chat-session-utils', () => ({
  ensureChatSessionForMessage: (...args: unknown[]) =>
    mockEnsureSession(...args),
}))

interface TestMessage extends ChatStreamMessage {
  timestamp?: string
}

type TestSession = { id: string; model_override?: string | null }

function makeRuntimeOptions(
  overrides: Partial<Parameters<typeof useChatRuntime>[0]> = {}
) {
  return {
    dataSource: {
      sessionsQueryKey: ['sessions'],
      sessionQueryKey: (sessionId: string) => ['session-detail', sessionId],
      listSessions: vi.fn(),
      getSession: vi.fn(),
      enabled: true,
    },
    mutations: {
      api: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
    skillSelection: {
      persistSession: vi.fn(),
    },
    ensureSession: {
      createSessionForMessage: vi.fn().mockResolvedValue({ id: 'session-new' }),
    },
    buildSendRequest: vi.fn().mockResolvedValue(new ReadableStream()),
    enqueue: {
      buildEnqueuePayload: vi.fn().mockReturnValue({ prompt: 'hello' }),
    },
    queueSessionId: 'session-1',
    ...overrides,
  } as Parameters<
    typeof useChatRuntime<TestSession, unknown, unknown, TestMessage>
  >[0]
}

describe('useChatRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue(undefined)
    mockDeleteItem.mockResolvedValue(undefined)
    mockResume.mockResolvedValue(undefined)
    sendTurnState.onTurnComplete = null
    sendTurnState.isSending = false
    queueState.queue = makeChatQueue({ items: [], current_item: null })
    mockEnsureSession.mockResolvedValue({
      sessionId: 'session-1',
      created: false,
      session: null,
    })
  })

  it('assembles direct stream presentation when directStream is enabled', () => {
    const { result } = renderHook(() =>
      useChatRuntime(makeRuntimeOptions({ presentation: { directStream: true } }))
    )

    expect(result.current.presentationView.messages).toEqual([])
    expect(result.current.presentationView.streamStatus).toBe('streaming')
    expect(result.current.presentationView.activityLog).toEqual(['step-1'])
    expect(result.current.presentationView.isSending).toBe(false)
    expect(result.current.presentationView.queue).toBeUndefined()
  })

  it('assembles queue presentation by default', () => {
    const { result } = renderHook(() => useChatRuntime(makeRuntimeOptions()))

    expect(result.current.presentationView.messages).toEqual([
      { id: 'queue-msg', type: 'ai', content: 'queued' },
    ])
    expect(result.current.presentationView.streamStatus).toBe('queue-stream')
    expect(result.current.presentationView.activityLog).toEqual(['queue-step'])
    expect(result.current.presentationView.isSending).toBe(true)
    expect(result.current.presentationView.queue).toEqual(queueState.queue)
  })

  it('passes send context into ensureSession create plugin', async () => {
    const createSessionForMessage = vi
      .fn()
      .mockResolvedValue({ id: 'session-new' })
    mockEnsureSession.mockImplementation(
      async ({
        createSession,
      }: {
        createSession: (title: string) => Promise<{ id: string }>
      }) => {
        const session = await createSession('Hello')
        return { sessionId: session.id, created: true, session }
      }
    )

    const { result } = renderHook(() =>
      useChatRuntime(
        makeRuntimeOptions({
          ensureSession: { createSessionForMessage },
        })
      )
    )

    const sessionId = await result.current.ensureSession('Hello')

    expect(createSessionForMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedSkillIdsRef: expect.objectContaining({ current: ['skill-1'] }),
        currentSession: expect.objectContaining({ id: 'session-1' }),
      }),
      'Hello'
    )
    expect(sessionId).toBe('session-new')
  })
})

describe('useChatRuntime client queue drain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue(undefined)
    mockDeleteItem.mockResolvedValue(undefined)
    mockResume.mockResolvedValue(undefined)
    sendTurnState.onTurnComplete = null
    sendTurnState.isSending = false
    queueState.queue = makeChatQueue({ items: [], current_item: null })
    mockEnsureSession.mockResolvedValue({
      sessionId: 'session-1',
      created: false,
      session: null,
    })
  })

  it('claims the next item with deleteItem before calling sendMessage', async () => {
    const callOrder: string[] = []
    mockDeleteItem.mockImplementation(async (id: string) => {
      callOrder.push(`delete:${id}`)
    })
    mockSendMessage.mockImplementation(async (prompt: string) => {
      callOrder.push(`send:${prompt}`)
    })

    const { result } = renderHook(() => useChatRuntime(makeRuntimeOptions()))
    queueState.queue = makeChatQueue({
      items: [
        makeQueueItem({
          id: 'chat_queue_item:a',
          position: 0,
          prompt: 'Drain me',
          execution_snapshot: {
            model_id: 'model-x',
            skill_ids: [],
            collection_ids: [],
            tool_ids: [],
            html_template_id: null,
            artifact_id: null,
            context_config: {},
            forwarded_props: {},
          },
        }),
      ],
    })

    await act(async () => {
      await result.current.drainNextQueuedMessage()
    })

    expect(callOrder).toEqual([
      'delete:chat_queue_item:a',
      'send:Drain me',
    ])
    expect(mockSendMessage).toHaveBeenCalledWith('Drain me', 'model-x')
  })

  it('does not send when deleteItem fails', async () => {
    mockDeleteItem.mockRejectedValue(new Error('claim failed'))
    const { result } = renderHook(() => useChatRuntime(makeRuntimeOptions()))
    queueState.queue = makeChatQueue({
      items: [makeQueueItem({ id: 'chat_queue_item:a', prompt: 'Nope' })],
    })

    await act(async () => {
      await result.current.drainNextQueuedMessage()
    })

    expect(mockDeleteItem).toHaveBeenCalledWith('chat_queue_item:a')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('drains the lowest-position pending item first', async () => {
    const { result } = renderHook(() => useChatRuntime(makeRuntimeOptions()))
    queueState.queue = makeChatQueue({
      items: [
        makeQueueItem({
          id: 'chat_queue_item:late',
          position: 2,
          prompt: 'Second',
        }),
        makeQueueItem({
          id: 'chat_queue_item:first',
          position: 0,
          prompt: 'First',
        }),
      ],
    })

    await act(async () => {
      await result.current.drainNextQueuedMessage()
    })

    expect(mockDeleteItem).toHaveBeenCalledWith('chat_queue_item:first')
    expect(mockSendMessage).toHaveBeenCalledWith('First', undefined)
  })

  it('passes null model_id as undefined model override', async () => {
    const { result } = renderHook(() => useChatRuntime(makeRuntimeOptions()))
    queueState.queue = makeChatQueue({
      items: [
        makeQueueItem({
          id: 'chat_queue_item:a',
          prompt: 'No model',
          execution_snapshot: {
            model_id: null,
            skill_ids: [],
            collection_ids: [],
            tool_ids: [],
            html_template_id: null,
            artifact_id: null,
            context_config: {},
            forwarded_props: {},
          },
        }),
      ],
    })

    await act(async () => {
      await result.current.drainNextQueuedMessage()
    })

    expect(mockSendMessage).toHaveBeenCalledWith('No model', undefined)
  })

  it('no-ops drain when the queue is paused', async () => {
    const { result } = renderHook(() => useChatRuntime(makeRuntimeOptions()))
    queueState.queue = makeChatQueue({
      status: 'paused',
      items: [makeQueueItem({ id: 'chat_queue_item:a', prompt: 'Paused' })],
    })

    await act(async () => {
      await result.current.drainNextQueuedMessage()
    })

    expect(mockDeleteItem).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('resumeQueue resumes then drains the next pending item', async () => {
    const callOrder: string[] = []
    mockResume.mockImplementation(async () => {
      callOrder.push('resume')
      queueState.queue = makeChatQueue({
        status: 'active',
        items: [
          makeQueueItem({ id: 'chat_queue_item:a', prompt: 'After resume' }),
        ],
      })
    })
    mockDeleteItem.mockImplementation(async () => {
      callOrder.push('delete')
    })
    mockSendMessage.mockImplementation(async () => {
      callOrder.push('send')
    })

    const { result } = renderHook(() => useChatRuntime(makeRuntimeOptions()))
    queueState.queue = makeChatQueue({
      status: 'paused',
      items: [makeQueueItem({ id: 'chat_queue_item:a', prompt: 'After resume' })],
    })

    await act(async () => {
      await result.current.resumeQueue()
    })

    expect(callOrder).toEqual(['resume', 'delete', 'send'])
  })

  it('onTurnComplete drains the next pending item', async () => {
    renderHook(() => useChatRuntime(makeRuntimeOptions()))
    queueState.queue = makeChatQueue({
      items: [
        makeQueueItem({ id: 'chat_queue_item:a', prompt: 'From turn complete' }),
      ],
    })

    expect(sendTurnState.onTurnComplete).toEqual(expect.any(Function))

    await act(async () => {
      await sendTurnState.onTurnComplete?.('session-1')
    })

    expect(mockDeleteItem).toHaveBeenCalledWith('chat_queue_item:a')
    expect(mockSendMessage).toHaveBeenCalledWith(
      'From turn complete',
      undefined
    )
  })

  it('chains FIFO drains across successive onTurnComplete callbacks', async () => {
    renderHook(() => useChatRuntime(makeRuntimeOptions()))
    const itemA = makeQueueItem({
      id: 'chat_queue_item:a',
      position: 0,
      prompt: 'A',
    })
    const itemB = makeQueueItem({
      id: 'chat_queue_item:b',
      position: 1,
      prompt: 'B',
    })
    queueState.queue = makeChatQueue({ items: [itemA, itemB] })

    mockDeleteItem.mockImplementation(async (id: string) => {
      queueState.queue = {
        ...queueState.queue,
        items: queueState.queue.items.filter((item) => item.id !== id),
      }
    })

    await act(async () => {
      await sendTurnState.onTurnComplete?.('session-1')
    })
    expect(mockSendMessage).toHaveBeenNthCalledWith(1, 'A', undefined)

    await act(async () => {
      await sendTurnState.onTurnComplete?.('session-1')
    })
    expect(mockSendMessage).toHaveBeenNthCalledWith(2, 'B', undefined)
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
  })

  it('idle recovery drains once when active pending work appears while idle', async () => {
    const { rerender } = renderHook(() => useChatRuntime(makeRuntimeOptions()))

    expect(mockDeleteItem).not.toHaveBeenCalled()

    queueState.queue = makeChatQueue({
      revision: 2,
      items: [
        makeQueueItem({ id: 'chat_queue_item:idle', prompt: 'Idle recover' }),
      ],
    })
    rerender()

    await waitFor(() => {
      expect(mockDeleteItem).toHaveBeenCalledWith('chat_queue_item:idle')
    })
    expect(mockSendMessage).toHaveBeenCalledWith('Idle recover', undefined)

    // Same recovery key should not drain again on another render.
    rerender()
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockDeleteItem).toHaveBeenCalledTimes(1)
  })
})

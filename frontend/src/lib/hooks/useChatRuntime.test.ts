import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryKey } from '@tanstack/react-query'
import { useChatRuntime } from './useChatRuntime'
import type { ChatStreamMessage } from './chat-sse-handlers'

const mockSendMessage = vi.fn()
const mockEnqueueMessage = vi.fn()
const mockEnsureSession = vi.fn()
const mockBuildSendRequest = vi.fn()
const mockBuildEnqueuePayload = vi.fn()

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    queue: { id: 'queue-1', items: [], current_item: null },
    streamError: null,
    pause: vi.fn(),
    resume: vi.fn(),
    editItem: vi.fn(),
    deleteItem: vi.fn(),
    retryItem: vi.fn(),
    reorder: vi.fn(),
    ensureRunner: vi.fn(),
    enqueueForSession: vi.fn(),
  }),
}))

vi.mock('@/lib/hooks/useChatSessionSelection', () => ({
  useChatSessionSelection: vi.fn(),
}))

vi.mock('@/lib/hooks/useChatSkillSelection', () => ({
  useChatSkillSelection: () => ({
    selectedSkillIds: ['skill-1'],
    selectedHtmlTemplateId: 'template-1',
    selectedMcpToolIds: ['tool-1'],
    selectedSkillIdsRef: { current: ['skill-1'] },
    selectedHtmlTemplateIdRef: { current: 'template-1' },
    selectedMcpToolIdsRef: { current: ['tool-1'] },
    setSelectedSkillIds: vi.fn(),
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
  useChatSendTurn: (options: { buildSendRequest: typeof mockBuildSendRequest }) => {
    mockBuildSendRequest.mockImplementation(options.buildSendRequest)
    return {
      sendMessage: mockSendMessage,
      isSending: false,
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
  ensureChatSessionForMessage: (...args: unknown[]) => mockEnsureSession(...args),
}))

interface TestMessage extends ChatStreamMessage {
  timestamp?: string
}

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
    ...overrides,
  } as Parameters<typeof useChatRuntime<TestSession, unknown, unknown, TestMessage>>[0]
}

type TestSession = { id: string; model_override?: string | null }

describe('useChatRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(result.current.presentationView.queue).toEqual({
      id: 'queue-1',
      items: [],
      current_item: null,
    })
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

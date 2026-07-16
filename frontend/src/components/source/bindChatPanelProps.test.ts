import { describe, expect, it, vi } from 'vitest'
import {
  bindProjectChatPanelProps,
  bindSharedProjectChatPanelProps,
  bindSourceChatPanelProps,
} from '@/components/source/bindChatPanelProps'
import type { useProjectChat } from '@/lib/hooks/useProjectChat'
import type { useSourceChat } from '@/lib/hooks/useSourceChat'

function createProjectChatMock(
  overrides: Partial<ReturnType<typeof useProjectChat>> = {}
): ReturnType<typeof useProjectChat> {
  return {
    messages: [],
    isSending: false,
    isDirectSending: false,
    streamStatus: null,
    activityLog: [],
    queue: undefined,
    queueHasWork: false,
    sendMessage: vi.fn(),
    enqueueMessage: vi.fn(),
    editAndResend: vi.fn(),
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
    editQueueItem: vi.fn(),
    deleteQueueItem: vi.fn(),
    retryQueueItem: vi.fn(),
    reorderQueue: vi.fn(),
    currentSession: undefined,
    pendingModelOverride: null,
    setModelOverride: vi.fn(),
    selectedSkillIds: [],
    setSelectedSkillIds: vi.fn(),
    selectedHtmlTemplateId: null,
    setSelectedHtmlTemplateId: vi.fn(),
    selectedMcpToolIds: [],
    setSelectedMcpToolIds: vi.fn(),
    liveMcpToolCalls: [],
    sessions: [],
    currentSessionId: null,
    createSession: vi.fn(),
    switchSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    loadingSessions: false,
    ...overrides,
  } as ReturnType<typeof useProjectChat>
}

function createSourceChatMock(
  overrides: Partial<ReturnType<typeof useSourceChat>> = {}
): ReturnType<typeof useSourceChat> {
  return {
    messages: [],
    isStreaming: false,
    isDirectSending: false,
    streamStatus: null,
    activityLog: [],
    contextIndicators: null,
    sendMessage: vi.fn(),
    enqueueMessage: vi.fn(),
    queue: undefined,
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
    editQueueItem: vi.fn(),
    deleteQueueItem: vi.fn(),
    retryQueueItem: vi.fn(),
    reorderQueue: vi.fn(),
    currentSession: undefined,
    currentSessionId: null,
    updateSession: vi.fn(),
    selectedSkillIds: [],
    setSelectedSkillIds: vi.fn(),
    selectedHtmlTemplateId: null,
    setSelectedHtmlTemplateId: vi.fn(),
    selectedMcpToolIds: [],
    setSelectedMcpToolIds: vi.fn(),
    liveMcpToolCalls: [],
    sessions: [],
    createSession: vi.fn(),
    switchSession: vi.fn(),
    deleteSession: vi.fn(),
    loadingSessions: false,
    ...overrides,
  } as ReturnType<typeof useSourceChat>
}

describe('bindProjectChatPanelProps', () => {
  it('maps project chat hook fields and applies overrides', () => {
    const chat = createProjectChatMock({
      queueHasWork: true,
      pendingModelOverride: 'gpt-4',
    })

    const props = bindProjectChatPanelProps(chat, {
      projectId: 'project-1',
      title: 'Project chat',
    })

    expect(props.contextType).toBe('project')
    expect(props.contextIndicators).toBeNull()
    expect(props.historyEditDisabled).toBe(true)
    expect(props.modelOverride).toBe('gpt-4')
    expect(props.projectId).toBe('project-1')
    expect(props.title).toBe('Project chat')
    expect(props.onEnqueueMessage).toBe(chat.enqueueMessage)
  })

  it('prefers session model override over pending override', () => {
    const chat = createProjectChatMock({
      currentSession: { model_override: 'claude-3' } as ReturnType<
        typeof useProjectChat
      >['currentSession'],
      pendingModelOverride: 'gpt-4',
    })

    const props = bindProjectChatPanelProps(chat)

    expect(props.modelOverride).toBe('claude-3')
  })
})

describe('bindSharedProjectChatPanelProps', () => {
  it('maps a reduced shared-mode prop set', () => {
    const chat = createProjectChatMock({
      isSending: true,
      currentSessionId: 'session-1',
    })

    const props = bindSharedProjectChatPanelProps(chat, {
      projectId: 'project-1',
      guestKey: 'guest-abc',
      variant: 'immersive',
    })

    expect(props.isStreaming).toBe(true)
    expect(props.currentSessionId).toBe('session-1')
    expect(props.projectId).toBe('project-1')
    expect(props.guestKey).toBe('guest-abc')
    expect(props.variant).toBe('immersive')
    expect(props.queue).toBeUndefined()
    expect(props.onModelChange).toBeUndefined()
  })
})

describe('bindSourceChatPanelProps', () => {
  it('maps source chat hook fields and wires model override via updateSession', () => {
    const updateSession = vi.fn()
    const chat = createSourceChatMock({
      currentSessionId: 'session-2',
      currentSession: { model_override: 'gpt-4o' } as ReturnType<
        typeof useSourceChat
      >['currentSession'],
      updateSession,
    })

    const props = bindSourceChatPanelProps(chat, {
      sourceId: 'source-1',
    })

    expect(props.sourceId).toBe('source-1')
    expect(props.modelOverride).toBe('gpt-4o')
    expect(props.contextIndicators).toBeNull()

    props.onModelChange?.('claude-3')
    expect(updateSession).toHaveBeenCalledWith('session-2', {
      model_override: 'claude-3',
    })
  })

  it('skips model update when no active session', () => {
    const updateSession = vi.fn()
    const chat = createSourceChatMock({ updateSession })

    const props = bindSourceChatPanelProps(chat)
    props.onModelChange?.('claude-3')

    expect(updateSession).not.toHaveBeenCalled()
  })
})

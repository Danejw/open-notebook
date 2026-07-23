import { describe, expect, it, vi } from 'vitest'
import {
  bindProjectChatPanelProps,
  bindSharedProjectChatPanelProps,
} from '@/components/source/bindChatPanelProps'
import type { useProjectChat } from '@/lib/hooks/useProjectChat'

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

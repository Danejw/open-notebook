import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SourceChatColumn } from '@/components/chat/SourceChatColumn'
import { useSourceChat } from '@/lib/hooks/useSourceChat'

const { chatWorkspaceSpy } = vi.hoisted(() => ({ chatWorkspaceSpy: vi.fn() }))

vi.mock('@/lib/hooks/useSourceChat')
vi.mock('@/components/chat/ChatWorkspace', () => ({
  ChatWorkspace: (props: unknown) => {
    chatWorkspaceSpy(props)
    return <div data-testid="chat-workspace" />
  },
}))

function createChatMock() {
  return {
    messages: [],
    isStreaming: false,
    isDirectSending: false,
    streamStatus: null,
    activityLog: [],
    contextIndicators: null,
    sessions: [],
    currentSessionId: null,
    currentSession: undefined,
    pendingModelOverride: null,
    loadingSessions: false,
    queue: { id: 'chat_queue:queue-1' },
    queueHasWork: false,
    sendMessage: vi.fn(),
    enqueueMessage: vi.fn(),
    cancelStreaming: vi.fn(),
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
    editQueueItem: vi.fn(),
    deleteQueueItem: vi.fn(),
    retryQueueItem: vi.fn(),
    reorderQueue: vi.fn(),
    setModelOverride: vi.fn(),
    setSelectedSkillIds: vi.fn(),
    setSelectedHtmlTemplateId: vi.fn(),
    setSelectedMcpToolIds: vi.fn(),
    createSession: vi.fn(),
    switchSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    selectedSkillIds: [],
    selectedHtmlTemplateId: null,
    selectedMcpToolIds: [],
    liveMcpToolCalls: [],
  } as unknown as ReturnType<typeof useSourceChat>
}

describe('SourceChatColumn', () => {
  it('shows skeleton while loading', () => {
    vi.mocked(useSourceChat).mockReturnValue(createChatMock())

    const { container } = render(
      <SourceChatColumn sourceId="source:1" loading={true} />
    )

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })

  it('renders shared chat workspace with source scope props', () => {
    const chat = createChatMock()
    vi.mocked(useSourceChat).mockReturnValue(chat)

    render(
      <SourceChatColumn
        sourceId="source:1"
        projectId="project:1"
        sourceTitle="Spec PDF"
      />
    )

    expect(screen.getByTestId('chat-workspace')).toBeInTheDocument()
    expect(chatWorkspaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: 'source',
        sourceId: 'source:1',
        projectId: 'project:1',
        contextIndicators: chat.contextIndicators,
        onCancelStreaming: chat.cancelStreaming,
        queue: chat.queue,
        onEnqueueMessage: chat.enqueueMessage,
      })
    )
  })
})

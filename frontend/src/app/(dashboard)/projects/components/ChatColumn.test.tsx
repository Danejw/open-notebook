import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatColumn } from '@/app/(dashboard)/projects/components/ChatColumn'
import { useProjectChat } from '@/lib/hooks/useProjectChat'

const { chatPanelSpy } = vi.hoisted(() => ({ chatPanelSpy: vi.fn() }))

vi.mock('@/lib/hooks/useProjectChat')
vi.mock('@/components/chat/ChatWorkspace', () => ({
  ChatWorkspace: (props: unknown) => {
    chatPanelSpy(props)
    return <div data-testid="chat-panel" />
  },
}))
vi.mock('@/lib/stores/project-columns-store', () => ({
  useProjectColumnsStore: () => ({
    chatCollapsed: false,
    toggleChat: vi.fn(),
  }),
}))

function createChatMock() {
  return {
    messages: [],
    isSending: false,
    tokenCount: 0,
    charCount: 0,
    sessions: [],
    currentSessionId: null,
    loadingSessions: false,
    queue: { id: 'chat_queue:queue-1' },
    queueHasWork: true,
    enqueueMessage: vi.fn(),
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
    editQueueItem: vi.fn(),
    deleteQueueItem: vi.fn(),
    retryQueueItem: vi.fn(),
    reorderQueue: vi.fn(),
  } as unknown as ReturnType<typeof useProjectChat>
}

describe('ChatColumn', () => {
  const baseProps = {
    projectId: 'test-project',
    contextSelections: {
      sources: {},
      notes: {},
    },
    sources: [],
    notes: [],
    notesLoading: false,
  }

  it('shows skeleton when sources are loading with no cached data', () => {
    vi.mocked(useProjectChat).mockReturnValue(createChatMock())

    const { container } = render(
      <ChatColumn {...baseProps} sourcesLoading={true} />
    )

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })

  it('renders chat panel when data is loaded', () => {
    const chat = createChatMock()
    vi.mocked(useProjectChat).mockReturnValue(chat)

    render(<ChatColumn {...baseProps} sourcesLoading={false} />)

    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
    expect(chatPanelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: chat.queue,
        onEnqueueMessage: chat.enqueueMessage,
        historyEditDisabled: true,
        onPauseQueue: chat.pauseQueue,
        onReorderQueue: chat.reorderQueue,
      })
    )
  })
})

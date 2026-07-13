import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatColumn } from './ChatColumn'
import { useProjectChat } from '@/lib/hooks/useProjectChat'

vi.mock('@/lib/hooks/useProjectChat')
vi.mock('@/components/source/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />
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
    vi.mocked(useProjectChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...baseProps} sourcesLoading={false} />)

    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })
})

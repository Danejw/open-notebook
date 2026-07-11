import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatColumn } from './ChatColumn'
import { useNotebookChat } from '@/lib/hooks/useNotebookChat'

vi.mock('@/lib/hooks/useNotebookChat')
vi.mock('@/components/source/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />
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
  } as unknown as ReturnType<typeof useNotebookChat>
}

describe('ChatColumn', () => {
  const baseProps = {
    notebookId: 'test-notebook',
    contextSelections: {
      sources: {},
      notes: {},
    },
    sources: [],
    notes: [],
    notesLoading: false,
  }

  it('shows skeleton when sources are loading with no cached data', () => {
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    const { container } = render(
      <ChatColumn {...baseProps} sourcesLoading={true} />
    )

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })

  it('renders chat panel when data is loaded', () => {
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...baseProps} sourcesLoading={false} />)

    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })
})

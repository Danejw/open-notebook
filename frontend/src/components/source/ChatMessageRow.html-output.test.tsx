import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatMessageRow } from '@/components/source/ChatMessageRow'

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/hooks/use-html-documents', () => ({
  useHtmlTemplate: () => ({
    data: { html_body: '<html><body>Template</body></html>' },
  }),
}))

vi.mock('@/lib/a2ui/constants', () => ({
  isA2uiChatEnabled: () => true,
}))

vi.mock('@/lib/a2ui/surface-store', () => ({
  useA2uiSurfaceStore: (
    selector: (state: {
      revision: number
      getSurfaceIdsForMessage: () => string[]
      getErrorForMessage: () => null
    }) => unknown
  ) =>
    selector({
      revision: 1,
      getSurfaceIdsForMessage: () => ['surface-1'],
      getErrorForMessage: () => null,
    }),
}))

vi.mock('@/lib/a2ui/use-inline-a2ui', () => ({
  useInlineA2uiFromContent: (_id: string, content: string) => content,
}))

vi.mock('@/components/a2ui/A2uiMessageSurface', () => ({
  A2uiMessageSurface: () => <div data-testid="a2ui-surface" />,
}))

vi.mock('@/components/templates/TemplateHtmlPreview', () => ({
  TemplateHtmlPreview: ({ html }: { html: string }) => (
    <div data-testid="template-preview">{html}</div>
  ),
}))

vi.mock('@/components/source/MessageActions', () => ({
  MessageActions: () => <div data-testid="message-actions" />,
}))

vi.mock('@/components/mcp/ToolCallGroup', () => ({
  ToolCallGroup: () => null,
}))

vi.mock('@/components/common/CitedMarkdownContent', () => ({
  CitedMarkdownContent: ({
    content,
    isStreaming,
  }: {
    content: string
    isStreaming?: boolean
  }) =>
    isStreaming ? (
      <p>{content}</p>
    ) : (
      <div data-testid="cited-markdown">{content}</div>
    ),
}))

vi.mock('@/lib/utils/restore-template-media', () => ({
  restoreTemplateMedia: (html: string) => html,
}))

const baseProps = {
  isEditing: false,
  editDraft: '',
  isStreaming: true,
  projectId: 'project:test',
  htmlTemplateId: 'html_template:test',
  canEdit: false,
  editLocked: false,
  onReferenceClick: vi.fn(),
  onStartEdit: vi.fn(),
  onEditDraftChange: vi.fn(),
  onCancelEdit: vi.fn(),
  onSubmitEdit: vi.fn(),
  onEditKeyDown: vi.fn(),
}

describe('ChatMessageRow HTML template output', () => {
  it('renders completed HTML after A2UI while the text turn is still streaming', () => {
    render(
      <ChatMessageRow
        {...baseProps}
        isStreamingThisMessage
        message={{
          id: 'message-1',
          type: 'ai',
          content:
            'Grounded summary.\n\n```html\n<html><body>Completed proposal</body></html>\n```',
        }}
      />
    )

    expect(screen.getByText('Grounded summary.')).toBeInTheDocument()
    expect(screen.getByTestId('a2ui-surface')).toBeInTheDocument()
    expect(screen.getByTestId('template-preview')).toHaveTextContent(
      'Completed proposal'
    )

    const a2uiOutput = screen.getByTestId('chat-a2ui-output')
    const htmlOutput = screen.getByTestId('chat-html-template-output')
    expect(
      a2uiOutput.compareDocumentPosition(htmlOutput) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})

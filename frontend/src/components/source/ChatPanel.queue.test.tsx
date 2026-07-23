import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ChatPanel } from '@/components/source/ChatPanel'
import { makeChatQueue, makeQueueItem } from '@/lib/test-fixtures/chat-queue'
import type { ChatQueueResponse } from '@/lib/types/chat-queue'

vi.mock('@/components/source/ChatMessageList', () => ({
  ChatMessageList: () => <div data-testid="message-list" />,
}))

vi.mock('@/lib/hooks/use-mcp', () => ({
  useMcpSessionToolCalls: () => ({ data: [] }),
}))

vi.mock('@/lib/hooks/use-models', () => ({
  useModels: () => ({ data: [] }),
}))

vi.mock('@/lib/hooks/use-html-documents', () => ({
  useHtmlTemplate: () => ({ data: undefined }),
}))

vi.mock('@/lib/hooks/use-modal-manager', () => ({
  useModalManager: () => ({ openModal: vi.fn() }),
}))

vi.mock('@/lib/hooks/useChatSuggestions', () => ({
  useChatSuggestions: () => ({
    suggestions: [],
    isLoading: false,
    recordSuggestionUsed: vi.fn(),
    recordManualSend: vi.fn(),
  }),
}))

vi.mock('@/lib/stores/chat-ui-store', () => ({
  useChatUiStore: (
    selector: (state: {
      suggestionsCollapsed: boolean
      setSuggestionsCollapsed: () => void
    }) => unknown
  ) =>
    selector({
      suggestionsCollapsed: true,
      setSuggestionsCollapsed: vi.fn(),
    }),
}))

const emptyQueue: ChatQueueResponse = makeChatQueue({
  items: [],
  current_item: null,
})

type EnqueueHandler = NonNullable<
  ComponentProps<typeof ChatPanel>['streaming']['onEnqueueMessage']
>

function queueBags(
  onEnqueueMessage: EnqueueHandler,
  extras: {
    isStreaming?: boolean
    isDirectStreaming?: boolean
    composerDisabled?: boolean
    onSendMessage?: ComponentProps<typeof ChatPanel>['streaming']['onSendMessage']
    queue?: ChatQueueResponse | undefined
  } = {}
): Pick<
  ComponentProps<typeof ChatPanel>,
  'streaming' | 'queueControls' | 'contextIndicators'
> {
  const queue = 'queue' in extras ? extras.queue : emptyQueue
  return {
    contextIndicators: null,
    streaming: {
      messages: [],
      isStreaming: extras.isStreaming ?? false,
      isDirectStreaming: extras.isDirectStreaming,
      composerDisabled: extras.composerDisabled,
      onSendMessage: extras.onSendMessage ?? vi.fn(),
      onEnqueueMessage,
    },
    queueControls: {
      queue,
      onPauseQueue: vi.fn(),
      onResumeQueue: vi.fn(),
      onEditQueueItem: vi.fn(),
      onDeleteQueueItem: vi.fn(),
      onRetryQueueItem: vi.fn(),
      onReorderQueue: vi.fn(),
    },
  }
}

describe('ChatPanel queue composer', () => {
  it('enqueues while another turn runs and defers the runner', async () => {
    const onEnqueueMessage = vi.fn<EnqueueHandler>().mockResolvedValue(undefined)
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        {...queueBags(onEnqueueMessage, {
          isStreaming: true,
          isDirectStreaming: true,
          composerDisabled: true,
          onSendMessage,
        })}
      />
    )

    const input = screen.getByRole('textbox', { name: 'chat-message' })
    expect(input).toBeEnabled()
    fireEvent.change(input, { target: { value: 'Queue this next' } })
    fireEvent.click(screen.getByRole('button', { name: 'chat.send' }))

    await waitFor(() =>
      expect(onEnqueueMessage).toHaveBeenCalledWith('Queue this next', {
        loopCount: 1,
        modelOverride: undefined,
        scheduleRunner: false,
      })
    )
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('defers scheduling while a queue drain owns the session', async () => {
    const onEnqueueMessage = vi.fn<EnqueueHandler>().mockResolvedValue(undefined)
    render(
      <ChatPanel
        {...queueBags(onEnqueueMessage, {
          isStreaming: true,
          isDirectStreaming: false,
        })}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'chat-message' }), {
      target: { value: 'After current queue item' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'chat.send' }))

    await waitFor(() =>
      expect(onEnqueueMessage).toHaveBeenCalledWith('After current queue item', {
        loopCount: 1,
        modelOverride: undefined,
        scheduleRunner: false,
      })
    )
  })

  it('sends directly when idle and the queue has no active work', async () => {
    const onEnqueueMessage = vi.fn<EnqueueHandler>().mockResolvedValue(undefined)
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        {...queueBags(onEnqueueMessage, {
          isStreaming: false,
          onSendMessage,
        })}
      />
    )

    expect(screen.queryByLabelText('chat.queueRuns')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'chat-message' }), {
      target: { value: 'Ask now' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'chat.send' }))

    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith('Ask now', undefined)
    )
    expect(onEnqueueMessage).not.toHaveBeenCalled()
  })

  it('sends directly before a queue snapshot exists when idle', async () => {
    const onEnqueueMessage = vi.fn<EnqueueHandler>().mockResolvedValue(undefined)
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        {...queueBags(onEnqueueMessage, {
          isStreaming: false,
          onSendMessage,
          queue: undefined,
        })}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'chat-message' }), {
      target: { value: 'First message' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'chat.send' }))

    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith('First message', undefined)
    )
    expect(onEnqueueMessage).not.toHaveBeenCalled()
  })

  it('sends normally when idle even if pending queue items already exist', async () => {
    const onEnqueueMessage = vi.fn<EnqueueHandler>().mockResolvedValue(undefined)
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        {...queueBags(onEnqueueMessage, {
          isStreaming: false,
          onSendMessage,
          queue: {
            ...emptyQueue,
            items: [
              makeQueueItem({
                id: 'chat_queue_item:pending',
                client_request_id: 'req-1',
                prompt: 'Waiting',
                stream_revision: 0,
              }),
            ],
          },
        })}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'chat-message' }), {
      target: { value: 'Add another' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'chat.send' }))

    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith('Add another', undefined)
    )
    expect(onEnqueueMessage).not.toHaveBeenCalled()
  })

  it('preserves the legacy direct-send path when no queue is provided', () => {
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        contextIndicators={null}
        streaming={{
          messages: [],
          isStreaming: false,
          onSendMessage,
        }}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'chat-message' }), {
      target: { value: 'Direct message' },
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'chat-message' }), {
      key: 'Enter',
    })

    expect(onSendMessage).toHaveBeenCalledWith('Direct message', undefined)
  })

  it('preserves the draft when enqueueing fails', async () => {
    const onEnqueueMessage = vi
      .fn<EnqueueHandler>()
      .mockRejectedValue(new Error('Queue unavailable'))
    render(
      <ChatPanel
        {...queueBags(onEnqueueMessage, {
          isStreaming: true,
        })}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'chat-message' }), {
      target: { value: 'Keep this draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'chat.send' }))

    await waitFor(() => expect(onEnqueueMessage).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: 'chat-message' })).toHaveValue(
      'Keep this draft'
    )
  })
})

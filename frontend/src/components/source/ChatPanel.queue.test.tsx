import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ChatPanel } from '@/components/source/ChatPanel'
import type { ChatQueueResponse } from '@/lib/types/chat-queue'

vi.mock('@/components/source/ChatMessageList', () => ({
  ChatMessageList: () => <div data-testid="message-list" />,
}))

vi.mock('@/lib/hooks/use-mcp', () => ({
  useMcpSessionToolCalls: () => ({ data: [] }),
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

const emptyQueue: ChatQueueResponse = {
  id: 'chat_queue:queue-1',
  chat_session: 'chat_session:session-1',
  status: 'active',
  revision: 1,
  runner_state: 'idle',
  runner_command_id: null,
  lease_owner: null,
  lease_expires_at: null,
  items: [],
  current_item: null,
  created: '2026-07-15T00:00:00Z',
  updated: '2026-07-15T00:00:00Z',
}

type EnqueueHandler = NonNullable<
  ComponentProps<typeof ChatPanel>['onEnqueueMessage']
>

function queueProps(onEnqueueMessage: EnqueueHandler) {
  return {
    queue: emptyQueue,
    onEnqueueMessage,
    onPauseQueue: vi.fn(),
    onResumeQueue: vi.fn(),
    onEditQueueItem: vi.fn(),
    onDeleteQueueItem: vi.fn(),
    onRetryQueueItem: vi.fn(),
    onReorderQueue: vi.fn(),
  }
}

describe('ChatPanel queue composer', () => {
  it('enqueues while another turn runs and defers the runner', async () => {
    const onEnqueueMessage = vi.fn<EnqueueHandler>().mockResolvedValue(undefined)
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        isStreaming
        isDirectStreaming
        contextIndicators={null}
        onSendMessage={onSendMessage}
        composerDisabled
        {...queueProps(onEnqueueMessage)}
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
        messages={[]}
        isStreaming
        isDirectStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
        {...queueProps(onEnqueueMessage)}
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
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
        {...queueProps(onEnqueueMessage)}
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
    const props = queueProps(onEnqueueMessage)
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
        {...props}
        queue={undefined}
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

  it('enqueues when idle if pending queue items already exist', async () => {
    const onEnqueueMessage = vi.fn<EnqueueHandler>().mockResolvedValue(undefined)
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
        {...queueProps(onEnqueueMessage)}
        queue={{
          ...emptyQueue,
          items: [
            {
              id: 'chat_queue_item:pending',
              queue_id: emptyQueue.id,
              chat_session: emptyQueue.chat_session,
              client_request_id: 'req-1',
              run_id: 'run-1',
              position: 0,
              status: 'pending',
              visible: true,
              prompt: 'Waiting',
              loop_count: 1,
              current_loop: 0,
              iteration_token: null,
              execution_snapshot: {
                model_id: null,
                skill_ids: [],
                tool_ids: [],
                html_template_id: null,
                artifact_id: null,
                context_config: {},
                forwarded_props: {},
              },
              runner_command_id: null,
              runner_state: 'idle',
              stream_revision: 0,
              stream_content: '',
              stream_progress: null,
              stream_activity: null,
              error_type: null,
              error_message: null,
              error_details: null,
              started_at: null,
              completed_at: null,
              failed_at: null,
              created: '2026-07-15T00:00:00Z',
              updated: '2026-07-15T00:00:00Z',
            },
          ],
        }}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'chat-message' }), {
      target: { value: 'Add another' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'chat.send' }))

    await waitFor(() =>
      expect(onEnqueueMessage).toHaveBeenCalledWith('Add another', {
        loopCount: 1,
        modelOverride: undefined,
        scheduleRunner: true,
      })
    )
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('preserves the legacy direct-send path when no queue is provided', () => {
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
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
        messages={[]}
        isStreaming
        contextIndicators={null}
        onSendMessage={vi.fn()}
        {...queueProps(onEnqueueMessage)}
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

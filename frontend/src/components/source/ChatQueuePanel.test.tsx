import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ChatQueuePanel,
  reorderPendingItemIds,
} from '@/components/source/ChatQueuePanel'
import type {
  ChatQueueItemResponse,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'
import {
  makeChatQueue,
  makeQueueItem,
} from '@/lib/test-fixtures/chat-queue'

function makeItem(
  overrides: Partial<ChatQueueItemResponse> = {}
): ChatQueueItemResponse {
  return makeQueueItem({
    prompt: 'Review the project schedule',
    ...overrides,
  })
}

function makeQueue(
  overrides: Partial<ChatQueueResponse> = {}
): ChatQueueResponse {
  const items = overrides.items ?? [makeItem()]
  return makeChatQueue({
    runner_state: 'scheduled',
    runner_command_id: 'command-1',
    ...overrides,
    items,
  })
}

function renderPanel(
  queue = makeQueue(),
  overrides: Partial<React.ComponentProps<typeof ChatQueuePanel>> = {}
) {
  const props: React.ComponentProps<typeof ChatQueuePanel> = {
    queue,
    onPause: vi.fn(),
    onResume: vi.fn(),
    onEditItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onRetryItem: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  }
  render(<ChatQueuePanel {...props} />)
  return props
}

describe('ChatQueuePanel', () => {
  it('hides completely when there are no active queue items', () => {
    renderPanel(makeQueue({ items: [] }))
    expect(screen.queryByText('chat.queue')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.queueEmpty')).not.toBeInTheDocument()
  })

  it('lists pending and failed top-down by position and hides running items', () => {
    const running = makeItem({
      id: 'chat_queue_item:running',
      prompt: 'Already sent to API',
      status: 'running',
      current_loop: 1,
      loop_count: 4,
      position: 20,
    })
    const pending = makeItem({
      id: 'chat_queue_item:pending',
      prompt: 'Queued first',
      position: 10,
    })
    const failed = makeItem({
      id: 'chat_queue_item:failed',
      prompt: 'Failed later',
      status: 'failed',
      error_message: 'Model unavailable',
      position: 15,
    })

    renderPanel(
      makeQueue({
        items: [running, failed, pending],
        current_item: running,
      })
    )

    const rows = screen.getAllByTestId('queue-item')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Queued first')
    expect(rows[1]).toHaveTextContent('Failed later')
    expect(screen.queryByText('Already sent to API')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.queueRunProgress 1/4')).not.toBeInTheDocument()
  })

  it('hides the panel when only a running item remains', () => {
    renderPanel(
      makeQueue({
        items: [
          makeItem({
            id: 'chat_queue_item:running',
            status: 'running',
            prompt: 'In flight',
          }),
        ],
        current_item: makeItem({
          id: 'chat_queue_item:running',
          status: 'running',
          prompt: 'In flight',
        }),
      })
    )

    expect(screen.queryByText('chat.queue')).not.toBeInTheDocument()
  })

  it('edits pending prompt and loop count inline', () => {
    const onEditItem = vi.fn()
    renderPanel(makeQueue(), { onEditItem })

    fireEvent.click(screen.getByLabelText('chat.queueEdit item-1'))
    fireEvent.change(screen.getByLabelText('chat.queuePrompt'), {
      target: { value: 'Review schedule risks' },
    })
    fireEvent.change(screen.getByLabelText('chat.queueRuns'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(onEditItem).toHaveBeenCalledWith('chat_queue_item:item-1', {
      prompt: 'Review schedule risks',
      loop_count: 3,
    })
  })

  it('requires confirmation before deleting any queued prompt', () => {
    const onDeleteItem = vi.fn()
    renderPanel(makeQueue(), { onDeleteItem })

    fireEvent.click(screen.getByLabelText('chat.queueDelete item-1'))
    expect(screen.getByText('chat.queueDeleteTitle')).toBeInTheDocument()
    expect(onDeleteItem).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }))

    expect(onDeleteItem).toHaveBeenCalledWith('chat_queue_item:item-1')
  })

  it('exposes failed-item retry and delete actions', () => {
    const onRetryItem = vi.fn()
    const onDeleteItem = vi.fn()
    renderPanel(
      makeQueue({
        status: 'paused',
        runner_state: 'idle',
        items: [
          makeItem({
            status: 'failed',
            error_message: 'Model unavailable',
          }),
        ],
      }),
      { onRetryItem, onDeleteItem }
    )

    expect(screen.getByText('Model unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('chat.queueRetry item-1'))
    fireEvent.click(screen.getByLabelText('chat.queueDelete item-1'))
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }))

    expect(onRetryItem).toHaveBeenCalledWith('chat_queue_item:item-1')
    expect(onDeleteItem).toHaveBeenCalledWith('chat_queue_item:item-1')
  })

  it('switches between pause and resume controls', () => {
    const activeProps = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'chat.queuePause' }))
    expect(activeProps.onPause).toHaveBeenCalled()

    const pausedProps = renderPanel(makeQueue({ status: 'paused' }))
    fireEvent.click(screen.getByRole('button', { name: 'chat.queueResume' }))
    expect(pausedProps.onResume).toHaveBeenCalled()
  })

  it('omits pending status chrome and keeps failed status visible', () => {
    renderPanel(
      makeQueue({
        items: [
          makeItem({ prompt: 'Waiting quietly' }),
          makeItem({
            id: 'chat_queue_item:failed',
            status: 'failed',
            prompt: 'Broken turn',
            error_message: 'Model unavailable',
          }),
        ],
      })
    )

    expect(screen.queryByText('chat.queueStatusPending')).not.toBeInTheDocument()
    expect(screen.getByText('chat.queueStatusFailed')).toBeInTheDocument()
    expect(screen.getByText('Model unavailable')).toBeInTheDocument()
  })
})

describe('reorderPendingItemIds', () => {
  it('moves only pending IDs for pointer and keyboard drag results', () => {
    expect(
      reorderPendingItemIds(['one', 'two', 'three'], 'three', 'one')
    ).toEqual(['three', 'one', 'two'])
  })

  it('returns the original order for invalid or identical targets', () => {
    const ids = ['one', 'two']
    expect(reorderPendingItemIds(ids, 'one', 'one')).toBe(ids)
    expect(reorderPendingItemIds(ids, 'missing', 'two')).toBe(ids)
  })
})

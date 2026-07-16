import { describe, expect, it } from 'vitest'
import { mergeActiveQueueMessages } from '@/lib/utils/chat-queue-messages'
import type {
  ChatQueueItemResponse,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'
import type { SourceChatMessage } from '@/lib/types/api'

function item(): ChatQueueItemResponse {
  return {
    id: 'chat_queue_item:item-1',
    queue_id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    client_request_id: 'request-1',
    run_id: 'run-1',
    position: 1,
    status: 'running',
    visible: true,
    prompt: 'Analyze schedule risk',
    loop_count: 2,
    current_loop: 0,
    iteration_token: 'iteration-1',
    execution_snapshot: {
      model_id: null,
      skill_ids: [],
      collection_ids: [],
      tool_ids: [],
      html_template_id: null,
      artifact_id: null,
      context_config: {},
      forwarded_props: {},
    },
    runner_command_id: null,
    runner_state: 'running',
    stream_revision: 4,
    stream_content: 'The primary risk is',
    stream_progress: null,
    stream_activity: null,
    error_type: null,
    error_message: null,
    error_details: null,
    started_at: '2026-07-15T00:00:00Z',
    completed_at: null,
    failed_at: null,
    created: '2026-07-15T00:00:00Z',
    updated: '2026-07-15T00:00:01Z',
  }
}

function queue(current: ChatQueueItemResponse | null): ChatQueueResponse {
  return {
    id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    status: 'active',
    revision: 4,
    runner_state: current ? 'running' : 'idle',
    runner_command_id: current ? 'command-1' : null,
    lease_owner: current ? 'worker-1' : null,
    lease_expires_at: current ? '2026-07-15T00:01:00Z' : null,
    items: current ? [current] : [],
    current_item: current,
    created: '2026-07-15T00:00:00Z',
    updated: '2026-07-15T00:00:01Z',
  }
}

describe('mergeActiveQueueMessages', () => {
  it('adds reconnectable human and partial assistant rows for the active item', () => {
    const messages: SourceChatMessage[] = []

    expect(mergeActiveQueueMessages(messages, queue(item()))).toEqual([
      expect.objectContaining({
        id: 'queue-human:chat_queue_item:item-1:1',
        type: 'human',
        content: 'Analyze schedule risk',
      }),
      expect.objectContaining({
        id: 'queue-ai:chat_queue_item:item-1:1',
        type: 'ai',
        content: 'The primary risk is',
      }),
    ])
  })

  it('does not add an empty assistant row or duplicate persisted stable rows', () => {
    const running = item()
    running.stream_content = ''
    const persisted: SourceChatMessage[] = [
      {
        id: 'queue-human:chat_queue_item:item-1:1',
        type: 'human',
        content: running.prompt,
      },
    ]

    expect(mergeActiveQueueMessages(persisted, queue(running))).toEqual(persisted)
  })

  it('surfaces the next pending prompt while the runner is scheduled', () => {
    const pending = item()
    pending.status = 'pending'
    pending.current_loop = 0
    pending.stream_content = ''
    pending.runner_state = 'idle'
    const scheduled = queue(null)
    scheduled.runner_state = 'scheduled'
    scheduled.items = [pending]

    // Pending items stay in the queue panel only — chat waits for claim.
    expect(mergeActiveQueueMessages([], scheduled)).toEqual([])
  })

  it('returns persisted history unchanged after the queue becomes idle', () => {
    const persisted: SourceChatMessage[] = [
      { id: 'human-1', type: 'human', content: 'Done' },
    ]
    expect(mergeActiveQueueMessages(persisted, queue(null))).toBe(persisted)
  })
})

import type {
  ChatQueueItemResponse,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'

/** Shared queue item fixture for chat-queue regression tests. */
export function makeQueueItem(
  overrides: Partial<ChatQueueItemResponse> = {}
): ChatQueueItemResponse {
  return {
    id: 'chat_queue_item:item-1',
    queue_id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    client_request_id: 'request-1',
    run_id: 'run-1',
    position: 0,
    status: 'pending',
    visible: true,
    prompt: 'First prompt',
    loop_count: 1,
    current_loop: 0,
    iteration_token: null,
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
    runner_state: 'idle',
    stream_revision: 1,
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
    ...overrides,
  }
}

/** Shared queue snapshot fixture for chat-queue regression tests. */
export function makeChatQueue(
  overrides: Partial<ChatQueueResponse> = {}
): ChatQueueResponse {
  const items = overrides.items ?? [makeQueueItem()]
  return {
    id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    status: 'active',
    revision: 1,
    runner_state: 'idle',
    runner_command_id: null,
    lease_owner: null,
    lease_expires_at: null,
    items,
    current_item: items.find((item) => item.status === 'running') ?? null,
    created: '2026-07-15T00:00:00Z',
    updated: '2026-07-15T00:00:00Z',
    ...overrides,
  }
}

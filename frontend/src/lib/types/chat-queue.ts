export type ChatQueueStatus = 'active' | 'paused'

export type ChatQueueRunnerState = 'idle' | 'scheduled' | 'running'

export type ChatQueueItemStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ChatQueueItemRunnerState =
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'

export type ChatQueueMetadata = Record<string, unknown>

export interface ChatQueueExecutionSnapshot {
  model_id: string | null
  skill_ids: string[] | null
  collection_ids: string[] | null
  tool_ids: string[] | null
  html_template_id: string | null
  artifact_id: string | null
  context_config: ChatQueueMetadata | null
  forwarded_props: ChatQueueMetadata | null
}

export interface ChatQueueItemResponse {
  id: string
  queue_id: string
  chat_session: string
  client_request_id: string
  run_id: string
  position: number
  status: ChatQueueItemStatus
  visible: boolean
  prompt: string
  loop_count: number
  current_loop: number
  iteration_token: string | null
  execution_snapshot: ChatQueueExecutionSnapshot
  runner_command_id: string | null
  runner_state: ChatQueueItemRunnerState
  stream_revision: number
  stream_content: string
  stream_progress: ChatQueueMetadata | null
  stream_activity: ChatQueueMetadata | null
  error_type: string | null
  error_message: string | null
  error_details: ChatQueueMetadata | null
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  created: string
  updated: string
}

export interface ChatQueueResponse {
  id: string
  chat_session: string
  status: ChatQueueStatus
  revision: number
  runner_state: ChatQueueRunnerState
  runner_command_id: string | null
  lease_owner: string | null
  lease_expires_at: string | null
  items: ChatQueueItemResponse[]
  current_item: ChatQueueItemResponse | null
  created: string
  updated: string
}

export interface ChatQueueItemEnqueuePayload {
  client_request_id: string
  prompt: string
  loop_count?: number
  model_id?: string | null
  skill_ids?: string[] | null
  collection_ids?: string[] | null
  tool_ids?: string[]
  html_template_id?: string | null
  artifact_id?: string | null
  context_config?: ChatQueueMetadata
  forwarded_props?: ChatQueueMetadata
  /** When false, persist without scheduling the drain worker yet. */
  schedule_runner?: boolean
}

export type ChatQueueEnqueueInput = Omit<
  ChatQueueItemEnqueuePayload,
  'client_request_id'
>

/**
 * True when a new composer submit should go to the queue instead of live AG-UI.
 * Only defer while a message turn is currently running; idle always sends normally.
 */
export function shouldDeferChatToQueue(
  isStreaming: boolean,
  _queue?: ChatQueueResponse | null
): boolean {
  return isStreaming
}

export interface ChatQueueItemUpdatePayload {
  prompt?: string
  loop_count?: number
  model_id?: string | null
  skill_ids?: string[] | null
  collection_ids?: string[] | null
  tool_ids?: string[] | null
  html_template_id?: string | null
  artifact_id?: string | null
  context_config?: ChatQueueMetadata | null
  forwarded_props?: ChatQueueMetadata | null
}

export interface ChatQueueStateUpdatePayload {
  status: ChatQueueStatus
}

export interface ChatQueueReorderPayload {
  item_ids: string[]
  expected_revision: number
}

export type ChatQueueSnapshotStreamEvent = {
  event: 'snapshot' | 'queue'
  revision: number
  queue: ChatQueueResponse
  item: null
}

export type ChatQueueItemStreamEvent = {
  event: 'item'
  revision: number
  queue: null
  item: ChatQueueItemResponse
}

export type ChatQueueHeartbeatStreamEvent = {
  event: 'heartbeat'
  revision: number
  queue: null
  item: null
}

export type ChatQueueStreamEvent =
  | ChatQueueSnapshotStreamEvent
  | ChatQueueItemStreamEvent
  | ChatQueueHeartbeatStreamEvent

export interface ChatQueueCompletion {
  type: 'item-completed' | 'queue-drained'
  queue: ChatQueueResponse
  item: ChatQueueItemResponse | null
}

/**
 * Reports whether an item can still change queue execution state.
 */
export function isChatQueueItemActive(status: ChatQueueItemStatus): boolean {
  switch (status) {
    case 'pending':
    case 'running':
      return true
    case 'completed':
    case 'failed':
    case 'cancelled':
      return false
    default: {
      const exhaustiveStatus: never = status
      return exhaustiveStatus
    }
  }
}

/**
 * Reports whether an item has reached a final queue state.
 */
export function isChatQueueItemTerminal(status: ChatQueueItemStatus): boolean {
  switch (status) {
    case 'completed':
    case 'failed':
    case 'cancelled':
      return true
    case 'pending':
    case 'running':
      return false
    default: {
      const exhaustiveStatus: never = status
      return exhaustiveStatus
    }
  }
}

/**
 * Reports whether queue changes are expected without another user mutation.
 */
export function isChatQueueStreamRelevant(queue: ChatQueueResponse): boolean {
  const hasRunningItem = queue.items.some((item) => item.status === 'running')

  switch (queue.status) {
    case 'paused':
      return hasRunningItem
    case 'active':
      switch (queue.runner_state) {
        case 'scheduled':
        case 'running':
          return true
        case 'idle':
          return queue.items.some((item) => isChatQueueItemActive(item.status))
        default: {
          const exhaustiveRunnerState: never = queue.runner_state
          return exhaustiveRunnerState
        }
      }
    default: {
      const exhaustiveStatus: never = queue.status
      return exhaustiveStatus
    }
  }
}

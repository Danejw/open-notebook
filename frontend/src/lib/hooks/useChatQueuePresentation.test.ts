import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ChatQueueResponse } from '@/lib/types/chat-queue'
import { useChatQueuePresentation } from './useChatQueuePresentation'

const emptyQueue: ChatQueueResponse = {
  id: 'queue-1',
  chat_session: 'session-1',
  status: 'active',
  revision: 1,
  runner_state: 'idle',
  runner_command_id: null,
  lease_owner: null,
  lease_expires_at: null,
  items: [],
  current_item: null,
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
}

describe('useChatQueuePresentation', () => {
  it('defaults includeFailed to true for queueHasWork', () => {
    const queue: ChatQueueResponse = {
      ...emptyQueue,
      items: [
        {
          id: 'item-1',
          queue_id: 'queue-1',
          chat_session: 'session-1',
          client_request_id: 'req-1',
          run_id: 'run-1',
          position: 0,
          status: 'failed',
          visible: true,
          prompt: 'x',
          loop_count: 1,
          current_loop: 1,
          iteration_token: null,
          execution_snapshot: {
            model_id: null,
            skill_ids: null,
            collection_ids: null,
            tool_ids: null,
            html_template_id: null,
            artifact_id: null,
            context_config: null,
            forwarded_props: null,
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
          created: '2026-01-01T00:00:00Z',
          updated: '2026-01-01T00:00:00Z',
        },
      ],
    }

    const { result } = renderHook(() =>
      useChatQueuePresentation({
        messages: [{ id: 'm-1', type: 'human', content: 'hello' }],
        queue,
        streamStatus: 'Thinking',
        activityLog: ['live'],
      })
    )

    expect(result.current.queueHasWork).toBe(true)
    expect(result.current.queueStreamStatus).toBe('Thinking')
    expect(result.current.queueActivityLog).toEqual(['live'])
  })
})

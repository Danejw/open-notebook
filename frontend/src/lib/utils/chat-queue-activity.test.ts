import { describe, expect, it } from 'vitest'
import { queueItemActivityPresentation } from '@/lib/utils/chat-queue-activity'
import type { ChatQueueItemResponse } from '@/lib/types/chat-queue'

function makeItem(
  overrides: Partial<ChatQueueItemResponse> = {}
): ChatQueueItemResponse {
  return {
    id: 'chat_queue_item:item-1',
    queue_id: 'chat_queue:queue-1',
    chat_session: 'chat_session:session-1',
    client_request_id: 'request-1',
    run_id: 'run-1',
    position: 0,
    status: 'running',
    visible: true,
    prompt: 'hi',
    loop_count: 1,
    current_loop: 1,
    iteration_token: 'tok',
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
    runner_state: 'running',
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

const t = (key: string) => {
  if (key === 'agentSteps.generating') return 'Generating response…'
  if (key === 'agentSteps.retrieving_context') return 'Retrieving context…'
  if (key === 'agentProgress.retrievedContext') return 'Retrieved no items'
  if (key === 'agentProgress.noContextItems') return 'no items'
  return key
}

describe('queueItemActivityPresentation', () => {
  it('defaults to generating status while a queue item is running', () => {
    expect(queueItemActivityPresentation(makeItem(), t)).toEqual({
      streamStatus: 'Generating response…',
      activityLog: [],
    })
  })

  it('formats stream_progress like the live AG-UI status bubble', () => {
    const presentation = queueItemActivityPresentation(
      makeItem({
        stream_progress: {
          phase: 'progress',
          step: 'retrieving_context',
        },
        stream_activity: {
          events: [
            {
              phase: 'completed',
              step: 'retrieving_context',
              detail: {},
            },
          ],
        },
      }),
      t
    )

    expect(presentation.streamStatus).toBe('Retrieving context…')
    expect(presentation.activityLog).toEqual(['Retrieved no items'])
  })

  it('falls back to live status when no queue item is running', () => {
    expect(
      queueItemActivityPresentation(
        makeItem({ status: 'pending' }),
        t,
        'Live status',
        ['Live log']
      )
    ).toEqual({
      streamStatus: 'Live status',
      activityLog: ['Live log'],
    })
  })
})

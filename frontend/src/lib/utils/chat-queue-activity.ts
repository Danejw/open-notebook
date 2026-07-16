import type { ChatQueueItemResponse } from '@/lib/types/chat-queue'
import {
  formatAgentProgressLogLine,
  formatAgentProgressStatus,
  parseAgentProgressEvent,
  type AgentProgressPayload,
  type TranslateFn,
} from '@/lib/ag-ui/progress'

function asProgressPayload(
  value: unknown
): AgentProgressPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return parseAgentProgressEvent({
    name: 'agent_progress',
    value,
  })
}

/**
 * Maps a running queue item's reconnectable progress into the same status
 * bubble the live AG-UI path shows (Generating response…, Retrieved…).
 */
export function queueItemActivityPresentation(
  item: ChatQueueItemResponse | null | undefined,
  t: TranslateFn,
  fallbackStatus: string | null = null,
  fallbackActivityLog: string[] = []
): { streamStatus: string | null; activityLog: string[] } {
  if (!item || item.status !== 'running') {
    return {
      streamStatus: fallbackStatus,
      activityLog: fallbackActivityLog,
    }
  }

  const progress = asProgressPayload(item.stream_progress)
  const formattedStatus = progress
    ? formatAgentProgressStatus(progress, t)
    : null

  const events = Array.isArray(item.stream_activity?.events)
    ? item.stream_activity.events
    : []
  const activityLog = events
    .map((event) => {
      const payload = asProgressPayload(event)
      if (!payload) {
        if (
          event &&
          typeof event === 'object' &&
          'message' in event &&
          typeof event.message === 'string'
        ) {
          return event.message
        }
        return null
      }
      return formatAgentProgressLogLine(payload, t)
    })
    .filter((line): line is string => Boolean(line))

  return {
    streamStatus:
      formattedStatus ||
      (typeof item.stream_progress?.message === 'string'
        ? item.stream_progress.message
        : null) ||
      t('agentSteps.generating'),
    activityLog,
  }
}

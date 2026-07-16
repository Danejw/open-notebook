import type { AgUiEvent } from '@/lib/ag-ui/events'
import { A2UI_EVENT } from '@/lib/a2ui/constants'
import type { A2uiServerMessage } from '@/lib/a2ui/types'

export interface ParsedA2uiCustomEvent {
  messages: A2uiServerMessage[]
  messageId: string | null
  surfaceId: string | null
}

function coerceMessages(value: unknown): A2uiServerMessage[] | null {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    // JSONL: one message per line
    if (trimmed.includes('\n')) {
      const lines = trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const messages: A2uiServerMessage[] = []
      for (const line of lines) {
        try {
          messages.push(JSON.parse(line) as A2uiServerMessage)
        } catch {
          return null
        }
      }
      return messages.length > 0 ? messages : null
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return coerceMessages(parsed)
    } catch {
      return null
    }
  }

  if (Array.isArray(value)) {
    return value as A2uiServerMessage[]
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.messages)) {
      return record.messages as A2uiServerMessage[]
    }
    if (record.version === 'v0.9') {
      return [record as A2uiServerMessage]
    }
  }

  return null
}

/**
 * Parse an AG-UI CUSTOM event named `a2ui` into protocol messages.
 */
export function parseA2uiCustomEvent(
  event: AgUiEvent
): ParsedA2uiCustomEvent | null {
  if (event.name !== A2UI_EVENT) {
    return null
  }

  const value = event.value
  const messages = coerceMessages(value)
  if (!messages) {
    return null
  }

  let messageId: string | null = null
  let surfaceId: string | null = null

  if (typeof event.messageId === 'string') {
    messageId = event.messageId
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (typeof record.messageId === 'string') {
      messageId = record.messageId
    }
    if (typeof record.surfaceId === 'string') {
      surfaceId = record.surfaceId
    }
  }

  if (!surfaceId) {
    for (const message of messages) {
      const id =
        message.createSurface?.surfaceId ||
        message.updateComponents?.surfaceId ||
        message.updateDataModel?.surfaceId ||
        message.deleteSurface?.surfaceId
      if (id) {
        surfaceId = id
        break
      }
    }
  }

  return { messages, messageId, surfaceId }
}

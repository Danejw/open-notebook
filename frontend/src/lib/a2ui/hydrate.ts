import type { A2uiServerMessage } from '@/lib/a2ui/types'
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { parseInlineA2uiFromText } from '@/lib/a2ui/parse-inline-a2ui'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'

type MessageWithA2ui = {
  id: string
  type: string
  content?: string
  a2ui_payload?: unknown
}

/**
 * Clear and re-hydrate A2UI surfaces from session message history.
 * Prefers persisted `a2ui_payload`; falls back to catalog JSON embedded in text.
 */
export function hydrateA2uiFromMessages(messages: MessageWithA2ui[]): void {
  if (!isA2uiChatEnabled()) {
    return
  }
  const store = useA2uiSurfaceStore.getState()
  store.clearAll()
  for (const message of messages) {
    if (message.type !== 'ai') {
      continue
    }
    const payload = message.a2ui_payload
    if (Array.isArray(payload) && payload.length > 0) {
      store.hydrateFromPayload(message.id, payload as A2uiServerMessage[])
      continue
    }
    const inline = parseInlineA2uiFromText(message.content ?? '', {
      messageId: message.id,
    })
    if (inline.messages?.length) {
      store.hydrateFromPayload(message.id, inline.messages)
    }
  }
}

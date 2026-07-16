import type { A2uiServerMessage } from '@/lib/a2ui/types'
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'

type MessageWithA2ui = {
  id: string
  type: string
  a2ui_payload?: unknown
}

/**
 * Clear and re-hydrate A2UI surfaces from session message history.
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
    if (!Array.isArray(payload) || payload.length === 0) {
      continue
    }
    store.hydrateFromPayload(message.id, payload as A2uiServerMessage[])
  }
}

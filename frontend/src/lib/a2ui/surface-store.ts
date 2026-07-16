import { create } from 'zustand'
import { MessageProcessor } from '@a2ui/web_core/v0_9'
import type { A2uiClientAction } from '@a2ui/web_core/v0_9'
import type { ReactComponentImplementation } from '@a2ui/react/v0_9'
import { cosCatalog } from '@/lib/a2ui/catalog/cos-catalog'
import { validateA2uiMessages, A2uiPolicyError } from '@/lib/a2ui/policy'
import type { A2uiActionHandler, A2uiServerMessage } from '@/lib/a2ui/types'

const PENDING_KEY = '__pending__'

type SurfaceGroup = {
  surfaceIds: string[]
  error: string | null
}

interface A2uiSurfaceStoreState {
  revision: number
  messageSurfaces: Record<string, SurfaceGroup>
  surfaceToMessage: Record<string, string>
  pendingMessages: A2uiServerMessage[] | null
  actionHandler: A2uiActionHandler | null
  processor: MessageProcessor<ReactComponentImplementation> | null
  ensureProcessor: () => MessageProcessor<ReactComponentImplementation>
  setActionHandler: (handler: A2uiActionHandler | null) => void
  applyMessages: (
    messageId: string | null,
    messages: A2uiServerMessage[]
  ) => { ok: boolean; error?: string }
  attachPendingToMessage: (messageId: string) => void
  hydrateFromPayload: (
    messageId: string,
    payload: A2uiServerMessage[] | null | undefined
  ) => void
  getSurfaceIdsForMessage: (messageId: string) => string[]
  getErrorForMessage: (messageId: string) => string | null
  clearAll: () => void
}

function extractSurfaceIds(messages: A2uiServerMessage[]): string[] {
  const ids: string[] = []
  for (const message of messages) {
    const surfaceId =
      message.createSurface?.surfaceId ||
      message.updateComponents?.surfaceId ||
      message.updateDataModel?.surfaceId ||
      message.deleteSurface?.surfaceId
    if (surfaceId && !ids.includes(surfaceId)) {
      ids.push(surfaceId)
    }
  }
  return ids
}

/**
 * A2uiSurface always mounts component id "root". Older payloads used
 * "context-confirm-root" — rewrite so hydrated history still renders.
 */
function normalizeRootComponentIds(
  messages: A2uiServerMessage[]
): A2uiServerMessage[] {
  return messages.map((message) => {
    if (!message.updateComponents?.components) {
      return message
    }
    let changed = false
    const components = message.updateComponents.components.map((component) => {
      if (component.id !== 'context-confirm-root') {
        return component
      }
      changed = true
      return { ...component, id: 'root' }
    })
    if (!changed) {
      return message
    }
    return {
      ...message,
      updateComponents: {
        ...message.updateComponents,
        components,
      },
    }
  })
}

function createProcessor(
  getHandler: () => A2uiActionHandler | null,
  getSurfaceToMessage: () => Record<string, string>
): MessageProcessor<ReactComponentImplementation> {
  return new MessageProcessor<ReactComponentImplementation>(
    [cosCatalog],
    (action: A2uiClientAction) => {
      const handler = getHandler()
      if (!handler) {
        return
      }
      const messageId = getSurfaceToMessage()[action.surfaceId] ?? null
      return handler(action, messageId)
    }
  )
}

export const useA2uiSurfaceStore = create<A2uiSurfaceStoreState>((set, get) => ({
  revision: 0,
  messageSurfaces: {},
  surfaceToMessage: {},
  pendingMessages: null,
  actionHandler: null,
  processor: null,

  ensureProcessor: () => {
    const existing = get().processor
    if (existing) {
      return existing
    }
    const processor = createProcessor(
      () => get().actionHandler,
      () => get().surfaceToMessage
    )
    set({ processor })
    return processor
  },

  setActionHandler: (handler) => {
    // Handler is resolved via get() inside the processor listener — do not
    // recreate MessageProcessor here or hydrated surfaces are wiped while
    // messageSurfaces still points at the old surface IDs.
    // #region agent log
    void fetch('http://127.0.0.1:7837/ingest/abf31c58-d978-4742-b014-939241ddfcd2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'eba9bf',
      },
      body: JSON.stringify({
        sessionId: 'eba9bf',
        hypothesisId: 'F',
        location: 'surface-store.ts:setActionHandler',
        message: 'updating action handler without recreating processor',
        data: {
          hasHandler: Boolean(handler),
          hasProcessor: Boolean(get().processor),
          surfaceCount: get().processor?.model.surfacesMap.size ?? 0,
          trackedMessages: Object.keys(get().messageSurfaces).length,
        },
        timestamp: Date.now(),
        runId: 'post-fix',
      }),
    }).catch(() => {})
    // #endregion
    set({ actionHandler: handler })
  },

  applyMessages: (messageId, messages) => {
    const normalizedMessages = normalizeRootComponentIds(messages)
    try {
      validateA2uiMessages(normalizedMessages)
    } catch (error) {
      const message =
        error instanceof A2uiPolicyError
          ? error.message
          : 'Invalid A2UI payload'
      if (messageId) {
        set((state) => ({
          revision: state.revision + 1,
          messageSurfaces: {
            ...state.messageSurfaces,
            [messageId]: {
              surfaceIds: state.messageSurfaces[messageId]?.surfaceIds ?? [],
              error: message,
            },
          },
        }))
      }
      return { ok: false, error: message }
    }

    if (!messageId) {
      set((state) => ({
        pendingMessages: normalizedMessages,
        revision: state.revision + 1,
      }))
      return { ok: true }
    }

    const processor = get().ensureProcessor()
    const surfaceIdsToApply = extractSurfaceIds(normalizedMessages)
    // Delete existing surfaces before recreate — MessageProcessor rejects duplicate createSurface.
    const deleteBeforeCreate: A2uiServerMessage[] = []
    for (const surfaceId of surfaceIdsToApply) {
      if (processor.model.getSurface(surfaceId)) {
        deleteBeforeCreate.push({
          version: 'v0.9',
          deleteSurface: { surfaceId },
        })
      }
    }
    const toProcess =
      deleteBeforeCreate.length > 0
        ? [...deleteBeforeCreate, ...normalizedMessages]
        : normalizedMessages
    // #region agent log
    const rootIds = normalizedMessages.flatMap(
      (m) =>
        m.updateComponents?.components
          ?.filter((c) => c.id === 'root' || c.id === 'context-confirm-root')
          .map((c) => c.id) ?? []
    )
    void fetch('http://127.0.0.1:7837/ingest/abf31c58-d978-4742-b014-939241ddfcd2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'eba9bf',
      },
      body: JSON.stringify({
        sessionId: 'eba9bf',
        hypothesisId: 'G',
        location: 'surface-store.ts:applyMessages',
        message: 'processing a2ui messages',
        data: {
          messageId,
          surfaceIds: surfaceIdsToApply,
          rootComponentIds: rootIds,
          deletedBeforeCreate: deleteBeforeCreate.map((m) => m.deleteSurface?.surfaceId),
        },
        timestamp: Date.now(),
        runId: 'post-fix',
      }),
    }).catch(() => {})
    // #endregion
    try {
      processor.processMessages(
        toProcess as Parameters<typeof processor.processMessages>[0]
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to process A2UI messages'
      // #region agent log
      void fetch('http://127.0.0.1:7837/ingest/abf31c58-d978-4742-b014-939241ddfcd2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'eba9bf',
        },
        body: JSON.stringify({
          sessionId: 'eba9bf',
          hypothesisId: 'G',
          location: 'surface-store.ts:applyMessages:error',
          message: 'a2ui processMessages failed',
          data: { messageId, surfaceIds: surfaceIdsToApply, error: message },
          timestamp: Date.now(),
          runId: 'post-fix',
        }),
      }).catch(() => {})
      // #endregion
      set((state) => ({
        revision: state.revision + 1,
        messageSurfaces: {
          ...state.messageSurfaces,
          [messageId]: {
            surfaceIds: state.messageSurfaces[messageId]?.surfaceIds ?? [],
            error: message,
          },
        },
      }))
      return { ok: false, error: message }
    }

    const surfaceIds = extractSurfaceIds(normalizedMessages)
    set((state) => {
      const surfaceToMessage = { ...state.surfaceToMessage }
      for (const surfaceId of surfaceIds) {
        surfaceToMessage[surfaceId] = messageId
      }
      const existing = state.messageSurfaces[messageId]?.surfaceIds ?? []
      const merged = [...existing]
      for (const id of surfaceIds) {
        if (!merged.includes(id)) {
          merged.push(id)
        }
      }
      return {
        revision: state.revision + 1,
        surfaceToMessage,
        pendingMessages: null,
        messageSurfaces: {
          ...state.messageSurfaces,
          [messageId]: { surfaceIds: merged, error: null },
        },
      }
    })
    return { ok: true }
  },

  attachPendingToMessage: (messageId) => {
    const pending = get().pendingMessages
    if (!pending || pending.length === 0) {
      return
    }
    get().applyMessages(messageId, pending)
  },

  hydrateFromPayload: (messageId, payload) => {
    if (!payload || !Array.isArray(payload) || payload.length === 0) {
      return
    }
    get().applyMessages(messageId, payload)
  },

  getSurfaceIdsForMessage: (messageId) => {
    return get().messageSurfaces[messageId]?.surfaceIds ?? []
  },

  getErrorForMessage: (messageId) => {
    return get().messageSurfaces[messageId]?.error ?? null
  },

  clearAll: () => {
    set({
      revision: 0,
      messageSurfaces: {},
      surfaceToMessage: {},
      pendingMessages: null,
      processor: null,
    })
  },
}))

/** @deprecated Prefer store methods; kept for pending-key debugging. */
export const A2UI_PENDING_MESSAGE_KEY = PENDING_KEY

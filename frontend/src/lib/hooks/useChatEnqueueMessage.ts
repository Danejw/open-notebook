'use client'

import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import type { ChatQueueEnqueueInput } from '@/lib/types/chat-queue'
import type { useChatQueue } from '@/lib/hooks/useChatQueue'
import { getApiErrorMessage } from '@/lib/utils/error-handler'

export interface UseChatEnqueueMessageOptions {
  currentSessionId: string | null
  chatQueue: Pick<ReturnType<typeof useChatQueue>, 'enqueueForSession'>
  t: TFunction

  /** Auto-create or resolve session id for enqueue. */
  ensureSession: (message: string) => Promise<string>

  buildEnqueuePayload: (params: {
    message: string
    modelOverride?: string
    loopCount: number
    scheduleRunner?: boolean
  }) => ChatQueueEnqueueInput

  /** When set, bypass queue and send directly (project sharedMode). */
  fallbackToSend?: (message: string, modelOverride?: string) => Promise<void>
}

/**
 * Shared enqueue turn orchestration with auto-create session and toast error handling.
 */
export function useChatEnqueueMessage({
  chatQueue,
  t,
  ensureSession,
  buildEnqueuePayload,
  fallbackToSend,
}: UseChatEnqueueMessageOptions) {
  const enqueueMessage = useCallback(
    async (
      message: string,
      options: {
        modelOverride?: string
        loopCount: number
        scheduleRunner?: boolean
      }
    ) => {
      if (fallbackToSend) {
        await fallbackToSend(message, options.modelOverride)
        return
      }

      try {
        const sessionId = await ensureSession(message)
        await chatQueue.enqueueForSession(
          sessionId,
          buildEnqueuePayload({
            message,
            modelOverride: options.modelOverride,
            loopCount: options.loopCount,
            scheduleRunner: options.scheduleRunner,
          })
        )
      } catch (err: unknown) {
        const error = err as {
          response?: { data?: { detail?: string } }
          message?: string
        }
        console.error('Error enqueueing message:', error)
        toast.error(
          getApiErrorMessage(
            error.response?.data?.detail || error.message || error,
            (key) => t(key),
            'apiErrors.failedToSendMessage'
          )
        )
        throw err
      }
    },
    [buildEnqueuePayload, chatQueue, ensureSession, fallbackToSend, t]
  )

  return { enqueueMessage }
}

/** Shared helper to wire session creation side-effects after auto-create. */
export function applyAutoCreatedSessionSideEffects({
  setCurrentSessionId,
  clearPendingOnSessionCreated,
  invalidateSessionsList,
  clearPendingModelOverride,
}: {
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>
  clearPendingOnSessionCreated?: () => void
  invalidateSessionsList: () => void
  clearPendingModelOverride?: () => void
}) {
  return (sessionId: string) => {
    setCurrentSessionId(sessionId)
    clearPendingModelOverride?.()
    clearPendingOnSessionCreated?.()
    invalidateSessionsList()
  }
}

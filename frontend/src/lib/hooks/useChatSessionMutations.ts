'use client'

import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface ChatSessionMutationsAdapter<
  TSession extends { id: string },
  TCreateData,
  TUpdateData,
> {
  create: (data: TCreateData) => Promise<TSession>
  update: (sessionId: string, data: TUpdateData) => Promise<TSession>
  delete: (sessionId: string) => Promise<void>
}

export interface UseChatSessionMutationsOptions<
  TSession extends { id: string },
  TCreateData,
  TUpdateData,
> {
  sessionsQueryKey: QueryKey
  sessionQueryKey: (sessionId: string) => QueryKey
  currentSessionId: string | null
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>
  setMessages: Dispatch<SetStateAction<unknown[]>>
  api: ChatSessionMutationsAdapter<TSession, TCreateData, TUpdateData>
  /** When false, suppress success toast on create (project sharedMode). Default true. */
  toastOnCreate?: boolean
}

/**
 * Shared session CRUD mutations with toast error handling for project/source chat.
 */
export function useChatSessionMutations<
  TSession extends { id: string },
  TCreateData,
  TUpdateData,
>({
  sessionsQueryKey,
  sessionQueryKey,
  currentSessionId,
  setCurrentSessionId,
  setMessages,
  api,
  toastOnCreate = true,
}: UseChatSessionMutationsOptions<TSession, TCreateData, TUpdateData>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const createSessionMutation = useMutation({
    mutationFn: (data: TCreateData) => api.create(data),
    onSuccess: (newSession) => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
      setCurrentSessionId(newSession.id)
      if (toastOnCreate) {
        toast.success(t('chat.sessionCreated'))
      }
    },
    onError: (err: unknown) => {
      const error = err as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          error.response?.data?.detail || error.message,
          (key) => t(key),
          'apiErrors.failedToCreateSession'
        )
      )
    },
  })

  const updateSessionMutation = useMutation({
    mutationFn: ({
      sessionId,
      data,
    }: {
      sessionId: string
      data: TUpdateData
    }) => api.update(sessionId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
      if (currentSessionId) {
        void queryClient.invalidateQueries({
          queryKey: sessionQueryKey(currentSessionId),
        })
      }
      toast.success(t('chat.sessionUpdated'))
    },
    onError: (err: unknown) => {
      const error = err as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          error.response?.data?.detail || error.message,
          (key) => t(key),
          'apiErrors.failedToUpdateSession'
        )
      )
    },
  })

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.delete(sessionId),
    onSuccess: (_, deletedId) => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
      if (currentSessionId === deletedId) {
        setCurrentSessionId(null)
        setMessages([])
      }
      toast.success(t('chat.sessionDeleted'))
    },
    onError: (err: unknown) => {
      const error = err as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          error.response?.data?.detail || error.message,
          (key) => t(key),
          'apiErrors.failedToDeleteSession'
        )
      )
    },
  })

  const createSession = useCallback(
    (data: TCreateData) => createSessionMutation.mutate(data),
    [createSessionMutation]
  )

  const updateSession = useCallback(
    (sessionId: string, data: TUpdateData) =>
      updateSessionMutation.mutate({ sessionId, data }),
    [updateSessionMutation]
  )

  const deleteSession = useCallback(
    (sessionId: string) => deleteSessionMutation.mutate(sessionId),
    [deleteSessionMutation]
  )

  const switchSession = useCallback(
    (
      sessionId: string,
      clearPending: () => void
    ) => {
      clearPending()
      setCurrentSessionId(sessionId)
    },
    [setCurrentSessionId]
  )

  return {
    createSessionMutation,
    updateSessionMutation,
    deleteSessionMutation,
    createSession,
    updateSession,
    deleteSession,
    switchSession,
  }
}

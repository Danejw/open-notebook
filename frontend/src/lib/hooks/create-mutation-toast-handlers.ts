import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { getApiErrorMessage } from '@/lib/utils/error-handler'

type TranslateFn = (key: string) => string

export interface MutationToastOptions {
  queryClient: QueryClient
  toast: (opts: {
    title: string
    description?: string
    variant?: 'default' | 'destructive'
  }) => void
  t: TranslateFn
  /** Query keys to invalidate on success (and optionally on settle). */
  invalidateKeys: QueryKey[]
  successDescription: string
  errorFallback?: string
}

/**
 * Shared success/error handlers for standard resource CRUD mutations.
 * Keeps toast + invalidate wiring DRY without a mega hook factory.
 */
export function createMutationToastHandlers({
  queryClient,
  toast,
  t,
  invalidateKeys,
  successDescription,
  errorFallback,
}: MutationToastOptions) {
  return {
    onSuccess: () => {
      for (const queryKey of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey })
      }
      toast({
        title: t('common.success'),
        description: successDescription,
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key), errorFallback),
        variant: 'destructive',
      })
    },
  }
}

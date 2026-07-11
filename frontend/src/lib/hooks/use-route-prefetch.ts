import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { notebooksApi } from '@/lib/api/notebooks'
import { podcastsApi } from '@/lib/api/podcasts'
import { sourcesApi } from '@/lib/api/sources'
import { QUERY_KEYS } from '@/lib/api/query-client'

const SOURCES_PREFETCH_PAGE_SIZE = 30

export function useRoutePrefetch() {
  const queryClient = useQueryClient()

  const prefetchRoute = useCallback(
    (href: string) => {
      switch (href) {
        case '/notebooks':
          void queryClient.prefetchQuery({
            queryKey: [...QUERY_KEYS.notebooks, { archived: false }],
            queryFn: () => notebooksApi.list({ archived: false, order_by: 'updated desc' }),
          })
          break
        case '/sources':
          void queryClient.prefetchInfiniteQuery({
            queryKey: QUERY_KEYS.sourcesAllInfinite('updated', 'desc'),
            queryFn: async ({ pageParam = 0 }) => {
              const data = await sourcesApi.list({
                limit: SOURCES_PREFETCH_PAGE_SIZE,
                offset: pageParam,
                sort_by: 'updated',
                sort_order: 'desc',
              })
              return {
                sources: data,
                nextOffset:
                  data.length === SOURCES_PREFETCH_PAGE_SIZE
                    ? pageParam + data.length
                    : undefined,
              }
            },
            initialPageParam: 0,
          })
          break
        case '/podcasts':
          void queryClient.prefetchQuery({
            queryKey: QUERY_KEYS.podcastEpisodes,
            queryFn: podcastsApi.listEpisodes,
          })
          break
        default:
          break
      }
    },
    [queryClient]
  )

  return prefetchRoute
}

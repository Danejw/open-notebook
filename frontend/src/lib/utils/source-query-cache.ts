import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { SourceListResponse } from '@/lib/types/api'

type SourcesInfinitePage = {
  sources: SourceListResponse[]
  nextOffset?: number
}

type SourcesInfiniteData = InfiniteData<SourcesInfinitePage>

function isSourcesInfiniteData(data: unknown): data is SourcesInfiniteData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'pages' in data &&
    Array.isArray((data as SourcesInfiniteData).pages)
  )
}

/** Update every sources list cache (flat arrays and infinite-query pages). */
export function patchAllSourceListQueries(
  queryClient: QueryClient,
  patchPage: (sources: SourceListResponse[]) => SourceListResponse[]
) {
  const entries = queryClient.getQueriesData<unknown>({ queryKey: ['sources'] })

  for (const [queryKey, data] of entries) {
    if (isSourcesInfiniteData(data)) {
      queryClient.setQueryData<SourcesInfiniteData>(queryKey, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          sources: patchPage(page.sources),
        })),
      })
      continue
    }

    if (Array.isArray(data)) {
      queryClient.setQueryData<SourceListResponse[]>(
        queryKey,
        patchPage(data as SourceListResponse[])
      )
    }
  }
}

export function removeSourceFromAllQueries(queryClient: QueryClient, sourceId: string) {
  patchAllSourceListQueries(queryClient, (sources) =>
    sources.filter((source) => source.id !== sourceId)
  )
}

export function prependSourceToAllQueries(
  queryClient: QueryClient,
  source: SourceListResponse
) {
  patchAllSourceListQueries(queryClient, (sources) => {
    if (sources.some((item) => item.id === source.id)) return sources
    return [source, ...sources]
  })
}

export function replaceSourceInAllQueries(
  queryClient: QueryClient,
  sourceId: string,
  replacement: SourceListResponse
) {
  patchAllSourceListQueries(queryClient, (sources) =>
    sources.map((source) => (source.id === sourceId ? replacement : source))
  )
}

export function removeSourceFromProjectQueries(
  queryClient: QueryClient,
  projectId: string,
  sourceId: string
) {
  queryClient.setQueryData<SourceListResponse[]>(QUERY_KEYS.sources(projectId), (old) =>
    old?.filter((source) => source.id !== sourceId)
  )

  queryClient.setQueryData<SourcesInfiniteData>(QUERY_KEYS.sourcesInfinite(projectId), (old) => {
    if (!old?.pages) return old
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        sources: page.sources.filter((source) => source.id !== sourceId),
      })),
    }
  })
}

export function snapshotSourceListQueries(queryClient: QueryClient) {
  return queryClient.getQueriesData<unknown>({ queryKey: ['sources'] }) as [
    QueryKey,
    unknown,
  ][]
}

export function restoreSourceListQueries(
  queryClient: QueryClient,
  snapshots: [QueryKey, unknown][]
) {
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data)
  }
}

export function buildOptimisticSource(
  variables: {
    title?: string
    type: 'link' | 'upload' | 'text'
    url?: string
    file_path?: string
    async_processing?: boolean
  },
  id = `optimistic-${Date.now()}`
): SourceListResponse {
  const now = new Date().toISOString()
  return {
    id,
    title: variables.title ?? null,
    asset:
      variables.type === 'link' && variables.url
        ? { url: variables.url }
        : variables.type === 'upload' && variables.file_path
          ? { file_path: variables.file_path }
          : null,
    embedded: false,
    embedded_chunks: 0,
    insights_count: 0,
    created: now,
    updated: now,
    status: variables.async_processing ? 'queued' : undefined,
  }
}

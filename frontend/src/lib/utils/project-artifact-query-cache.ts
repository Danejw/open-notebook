import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { ProjectArtifactResponse } from '@/lib/types/api'
import { QUERY_KEYS } from '@/lib/api/query-client'

const listQueryPrefix = ['projectArtifacts'] as const

export function patchAllProjectArtifactListQueries(
  queryClient: QueryClient,
  patch: (artifacts: ProjectArtifactResponse[]) => ProjectArtifactResponse[]
) {
  const entries = queryClient.getQueriesData<ProjectArtifactResponse[]>({
    queryKey: listQueryPrefix,
  })
  for (const [queryKey, data] of entries) {
    if (!Array.isArray(data)) continue
    queryClient.setQueryData<ProjectArtifactResponse[]>(queryKey, patch(data))
  }
}

export function removeProjectArtifactFromAllQueries(queryClient: QueryClient, artifactId: string) {
  patchAllProjectArtifactListQueries(queryClient, (artifacts) =>
    artifacts.filter((artifact) => artifact.id !== artifactId)
  )
}

export function prependProjectArtifactToProjectQuery(
  queryClient: QueryClient,
  projectId: string | undefined,
  artifact: ProjectArtifactResponse
) {
  if (!projectId) return
  queryClient.setQueryData<ProjectArtifactResponse[]>(
    QUERY_KEYS.projectArtifacts(projectId),
    (old) => {
      const list = old ?? []
      if (list.some((item) => item.id === artifact.id)) return list
      return [artifact, ...list]
    }
  )
}

export function snapshotProjectArtifactListQueries(queryClient: QueryClient) {
  return queryClient.getQueriesData<ProjectArtifactResponse[]>({
    queryKey: listQueryPrefix,
  }) as [QueryKey, ProjectArtifactResponse[] | undefined][]
}

export function restoreProjectArtifactListQueries(
  queryClient: QueryClient,
  snapshots: [QueryKey, ProjectArtifactResponse[] | undefined][]
) {
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data)
  }
}

function deriveTitleFromContent(content: string): string | null {
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch?.[1]) {
    return headingMatch[1].trim().slice(0, 80)
  }

  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return firstLine ? firstLine.slice(0, 80) : null
}

export function buildOptimisticProjectArtifact(
  variables: {
    title?: string
    content: string
    artifact_kind?: string
    note_type?: string
    project_id?: string
  },
  id = `optimistic-${Date.now()}`
): ProjectArtifactResponse {
  const now = new Date().toISOString()
  const kind = variables.artifact_kind ?? variables.note_type ?? 'manual'
  return {
    id,
    title: variables.title ?? deriveTitleFromContent(variables.content) ?? null,
    content: variables.content,
    artifact_kind: kind,
    note_type: kind,
    created: now,
    updated: now,
  }
}

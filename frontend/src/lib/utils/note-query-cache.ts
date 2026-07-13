import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { NoteResponse } from '@/lib/types/api'

export function patchAllNoteListQueries(
  queryClient: QueryClient,
  patch: (notes: NoteResponse[]) => NoteResponse[]
) {
  const entries = queryClient.getQueriesData<NoteResponse[]>({ queryKey: ['notes'] })
  for (const [queryKey, data] of entries) {
    if (!Array.isArray(data)) continue
    queryClient.setQueryData<NoteResponse[]>(queryKey, patch(data))
  }
}

export function removeNoteFromAllQueries(queryClient: QueryClient, noteId: string) {
  patchAllNoteListQueries(queryClient, (notes) => notes.filter((note) => note.id !== noteId))
}

export function prependNoteToProjectQuery(
  queryClient: QueryClient,
  projectId: string | undefined,
  note: NoteResponse
) {
  if (!projectId) return
  queryClient.setQueryData<NoteResponse[]>(['notes', projectId], (old) => {
    const list = old ?? []
    if (list.some((item) => item.id === note.id)) return list
    return [note, ...list]
  })
}

export function snapshotNoteListQueries(queryClient: QueryClient) {
  return queryClient.getQueriesData<NoteResponse[]>({ queryKey: ['notes'] }) as [
    QueryKey,
    NoteResponse[] | undefined,
  ][]
}

export function restoreNoteListQueries(
  queryClient: QueryClient,
  snapshots: [QueryKey, NoteResponse[] | undefined][]
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

export function buildOptimisticNote(
  variables: {
    title?: string
    content: string
    note_type?: string
    project_id?: string
  },
  id = `optimistic-${Date.now()}`
): NoteResponse {
  const now = new Date().toISOString()
  return {
    id,
    title: variables.title ?? deriveTitleFromContent(variables.content) ?? null,
    content: variables.content,
    note_type: variables.note_type ?? null,
    created: now,
    updated: now,
  }
}

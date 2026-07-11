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

export function prependNoteToNotebookQuery(
  queryClient: QueryClient,
  notebookId: string | undefined,
  note: NoteResponse
) {
  if (!notebookId) return
  queryClient.setQueryData<NoteResponse[]>(['notes', notebookId], (old) => {
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

export function buildOptimisticNote(
  variables: {
    title?: string
    content: string
    note_type?: string
    notebook_id?: string
  },
  id = `optimistic-${Date.now()}`
): NoteResponse {
  const now = new Date().toISOString()
  return {
    id,
    title: variables.title ?? null,
    content: variables.content,
    note_type: variables.note_type ?? null,
    created: now,
    updated: now,
  }
}

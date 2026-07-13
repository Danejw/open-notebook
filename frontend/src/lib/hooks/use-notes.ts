import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notesApi } from '@/lib/api/notes'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import {
  buildOptimisticNote,
  patchAllNoteListQueries,
  prependNoteToProjectQuery,
  removeNoteFromAllQueries,
  restoreNoteListQueries,
  snapshotNoteListQueries,
} from '@/lib/utils/note-query-cache'
import { CreateNoteRequest, NoteResponse, UpdateNoteRequest } from '@/lib/types/api'

export function useNotes(projectId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.notes(projectId),
    queryFn: () => notesApi.list({ project_id: projectId }),
    enabled: !!projectId,
  })
}

export function useNote(id?: string, options?: { enabled?: boolean }) {
  const noteId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.note(noteId),
    queryFn: () => notesApi.get(noteId),
    enabled: !!noteId && (options?.enabled ?? true),
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateNoteRequest) => notesApi.create(data),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] })
      const previous = snapshotNoteListQueries(queryClient)
      const optimistic = buildOptimisticNote(variables)
      prependNoteToProjectQuery(queryClient, variables.project_id, optimistic)
      return { previous, optimisticId: optimistic.id, projectId: variables.project_id }
    },
    onSuccess: (result, variables, context) => {
      if (context?.optimisticId) {
        patchAllNoteListQueries(queryClient, (notes) =>
          notes.map((note) => (note.id === context.optimisticId ? result : note))
        )
        if (variables.project_id) {
          queryClient.setQueryData(QUERY_KEYS.note(result.id), result)
        }
      }
      toast({
        title: t('common.success'),
        description: t('projects.noteCreatedSuccess'),
      })
    },
    onError: (error: unknown, _variables, context) => {
      if (context?.previous) {
        restoreNoteListQueries(queryClient, context.previous)
      }
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('projects.failedToCreateNote')),
        variant: 'destructive',
      })
    },
    onSettled: (_data, _error, variables) => {
      if (variables.project_id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notes(variables.project_id) })
      }
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNoteRequest }) =>
      notesApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] })
      const previousLists = snapshotNoteListQueries(queryClient)
      const previousNote = queryClient.getQueryData<NoteResponse>(QUERY_KEYS.note(id))

      patchAllNoteListQueries(queryClient, (notes) =>
        notes.map((note) =>
          note.id === id
            ? {
                ...note,
                title: data.title ?? note.title,
                content: data.content ?? note.content,
                note_type: data.note_type ?? note.note_type,
                updated: new Date().toISOString(),
              }
            : note
        )
      )

      if (previousNote) {
        queryClient.setQueryData<NoteResponse>(QUERY_KEYS.note(id), {
          ...previousNote,
          title: data.title ?? previousNote.title,
          content: data.content ?? previousNote.content,
          note_type: data.note_type ?? previousNote.note_type,
          updated: new Date().toISOString(),
        })
      }

      return { previousLists, previousNote }
    },
    onSuccess: (result, { id }) => {
      queryClient.setQueryData(QUERY_KEYS.note(id), result)
      toast({
        title: t('common.success'),
        description: t('projects.noteUpdatedSuccess'),
      })
    },
    onError: (error: unknown, { id }, context) => {
      if (context?.previousLists) {
        restoreNoteListQueries(queryClient, context.previousLists)
      }
      if (context?.previousNote) {
        queryClient.setQueryData(QUERY_KEYS.note(id), context.previousNote)
      }
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('projects.failedToUpdateNote')),
        variant: 'destructive',
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] })
      const previous = snapshotNoteListQueries(queryClient)
      removeNoteFromAllQueries(queryClient, id)
      return { previous }
    },
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: t('projects.noteDeletedSuccess'),
      })
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) {
        restoreNoteListQueries(queryClient, context.previous)
      }
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('projects.failedToDeleteNote')),
        variant: 'destructive',
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useExportNotePdf() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => notesApi.exportPdf(id),
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: t('projects.exportPdfSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('projects.failedToExportPdf')),
        variant: 'destructive',
      })
    },
  })
}

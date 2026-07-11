import { useQuery, useMutation, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import { notebooksApi } from '@/lib/api/notebooks'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import { CreateNotebookRequest, UpdateNotebookRequest, NotebookResponse } from '@/lib/types/api'

type NotebooksQueryOptions = Pick<UseQueryOptions<NotebookResponse[]>, 'enabled'>

export function useNotebooks(archived?: boolean, options?: NotebooksQueryOptions) {
  return useQuery({
    queryKey: [...QUERY_KEYS.notebooks, { archived }],
    queryFn: () => notebooksApi.list({ archived, order_by: 'updated desc' }),
    enabled: options?.enabled ?? true,
    placeholderData: (previousData) => previousData,
  })
}

export function useNotebook(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.notebook(id),
    queryFn: () => notebooksApi.get(id),
    enabled: !!id,
    placeholderData: (previousData) => previousData,
  })
}

export function useCreateNotebook() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateNotebookRequest) => notebooksApi.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.notebooks })
      const previousLists = queryClient.getQueriesData<NotebookResponse[]>({
        queryKey: QUERY_KEYS.notebooks,
      })
      const now = new Date().toISOString()
      const optimistic: NotebookResponse = {
        id: `optimistic-${Date.now()}`,
        name: data.name,
        description: data.description ?? '',
        archived: false,
        created: now,
        updated: now,
        source_count: 0,
        note_count: 0,
      }
      queryClient.setQueriesData<NotebookResponse[]>(
        { queryKey: QUERY_KEYS.notebooks },
        (old) => (old ? [optimistic, ...old] : [optimistic])
      )
      return { previousLists }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebooks })
      toast({
        title: t('common.success'),
        description: t('notebooks.createSuccess'),
      })
    },
    onError: (error: unknown, _data, context) => {
      context?.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data)
      })
      toast({
        title: t('common.error'),
        description: t(getApiErrorKey(error, t('common.error'))),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateNotebook() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNotebookRequest }) =>
      notebooksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.notebooks })
      const previousLists = queryClient.getQueriesData<NotebookResponse[]>({
        queryKey: QUERY_KEYS.notebooks,
      })
      queryClient.setQueriesData<NotebookResponse[]>(
        { queryKey: QUERY_KEYS.notebooks },
        (old) =>
          old?.map((notebook) =>
            notebook.id === id
              ? {
                  ...notebook,
                  name: data.name ?? notebook.name,
                  description: data.description ?? notebook.description,
                  archived: data.archived ?? notebook.archived,
                  updated: new Date().toISOString(),
                }
              : notebook
          ) ?? []
      )
      const previousNotebook = queryClient.getQueryData<NotebookResponse>(QUERY_KEYS.notebook(id))
      if (previousNotebook) {
        queryClient.setQueryData<NotebookResponse>(QUERY_KEYS.notebook(id), {
          ...previousNotebook,
          name: data.name ?? previousNotebook.name,
          description: data.description ?? previousNotebook.description,
          archived: data.archived ?? previousNotebook.archived,
          updated: new Date().toISOString(),
        })
      }
      return { previousLists, previousNotebook, id }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebooks })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebook(id) })
      toast({
        title: t('common.success'),
        description: t('notebooks.updateSuccess'),
      })
    },
    onError: (error: unknown, { id }, context) => {
      context?.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data)
      })
      if (context?.previousNotebook) {
        queryClient.setQueryData(QUERY_KEYS.notebook(id), context.previousNotebook)
      }
      toast({
        title: t('common.error'),
        description: t(getApiErrorKey(error, t('common.error'))),
        variant: 'destructive',
      })
    },
  })
}

export function useNotebookDeletePreview(id: string, enabled: boolean = false) {
  return useQuery({
    queryKey: [...QUERY_KEYS.notebook(id), 'delete-preview'],
    queryFn: () => notebooksApi.deletePreview(id),
    enabled: !!id && enabled,
  })
}

export function useDeleteNotebook() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({
      id,
      deleteExclusiveSources = false,
    }: {
      id: string
      deleteExclusiveSources?: boolean
    }) => notebooksApi.delete(id, deleteExclusiveSources),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.notebooks })
      const previousLists = queryClient.getQueriesData<NotebookResponse[]>({
        queryKey: QUERY_KEYS.notebooks,
      })
      queryClient.setQueriesData<NotebookResponse[]>(
        { queryKey: QUERY_KEYS.notebooks },
        (old) => old?.filter((notebook) => notebook.id !== id) ?? []
      )
      return { previousLists }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notebooks })
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      toast({
        title: t('common.success'),
        description: t('notebooks.deleteSuccess'),
      })
    },
    onError: (error: unknown, _vars, context) => {
      context?.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data)
      })
      toast({
        title: t('common.error'),
        description: t(getApiErrorKey(error, t('common.error'))),
        variant: 'destructive',
      })
    },
  })
}
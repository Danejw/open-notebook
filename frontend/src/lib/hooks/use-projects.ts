import { useQuery, useMutation, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import { projectsApi } from '@/lib/api/projects'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { CreateProjectRequest, UpdateProjectRequest, ProjectResponse } from '@/lib/types/api'

type ProjectsQueryOptions = Pick<UseQueryOptions<ProjectResponse[]>, 'enabled'>

/**
 * `QUERY_KEYS.projects` is a prefix that also matches single-project caches
 * (`['projects', id]`). Only list caches are arrays.
 */
function isProjectListCache(value: unknown): value is ProjectResponse[] {
  return Array.isArray(value)
}

export function useProjects(archived?: boolean, options?: ProjectsQueryOptions) {
  return useQuery({
    queryKey: [...QUERY_KEYS.projects, { archived }],
    queryFn: () => projectsApi.list({ archived, order_by: 'updated desc' }),
    enabled: options?.enabled ?? true,
    placeholderData: (previousData) => previousData,
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.project(id),
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
    placeholderData: (previousData) => previousData,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateProjectRequest) => projectsApi.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.projects })
      const previousLists = queryClient.getQueriesData({
        queryKey: QUERY_KEYS.projects,
      })
      const now = new Date().toISOString()
      const optimistic: ProjectResponse = {
        id: `optimistic-${Date.now()}`,
        name: data.name,
        description: data.description ?? '',
        archived: false,
        created: now,
        updated: now,
        source_count: 0,
        note_count: 0,
      }
      queryClient.setQueriesData(
        { queryKey: QUERY_KEYS.projects },
        (old: unknown) => {
          if (!isProjectListCache(old)) {
            return old
          }
          return [optimistic, ...old]
        }
      )
      return { previousLists }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects })
      toast({
        title: t('common.success'),
        description: t('projects.createSuccess'),
      })
    },
    onError: (error: unknown, _data, context) => {
      context?.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data)
      })
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, t, 'common.error'),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectRequest }) =>
      projectsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.projects })
      const previousLists = queryClient.getQueriesData({
        queryKey: QUERY_KEYS.projects,
      })
      queryClient.setQueriesData(
        { queryKey: QUERY_KEYS.projects },
        (old: unknown) => {
          if (!isProjectListCache(old)) {
            return old
          }
          return old.map((project) =>
            project.id === id
              ? {
                  ...project,
                  name: data.name ?? project.name,
                  description: data.description ?? project.description,
                  archived: data.archived ?? project.archived,
                  updated: new Date().toISOString(),
                }
              : project
          )
        }
      )
      const previousProject = queryClient.getQueryData<ProjectResponse>(QUERY_KEYS.project(id))
      if (previousProject) {
        queryClient.setQueryData<ProjectResponse>(QUERY_KEYS.project(id), {
          ...previousProject,
          name: data.name ?? previousProject.name,
          description: data.description ?? previousProject.description,
          archived: data.archived ?? previousProject.archived,
          updated: new Date().toISOString(),
        })
      }
      return { previousLists, previousProject, id }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.project(id) })
      toast({
        title: t('common.success'),
        description: t('projects.updateSuccess'),
      })
    },
    onError: (error: unknown, { id }, context) => {
      context?.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data)
      })
      if (context?.previousProject) {
        queryClient.setQueryData(QUERY_KEYS.project(id), context.previousProject)
      }
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, t, 'common.error'),
        variant: 'destructive',
      })
    },
  })
}

export function useProjectDeletePreview(id: string, enabled: boolean = false) {
  return useQuery({
    queryKey: [...QUERY_KEYS.project(id), 'delete-preview'],
    queryFn: () => projectsApi.deletePreview(id),
    enabled: !!id && enabled,
  })
}

export function useDeleteProject() {
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
    }) => projectsApi.delete(id, deleteExclusiveSources),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.projects })
      const previousLists = queryClient.getQueriesData({
        queryKey: QUERY_KEYS.projects,
      })
      queryClient.setQueriesData(
        { queryKey: QUERY_KEYS.projects },
        (old: unknown) => {
          if (!isProjectListCache(old)) {
            return old
          }
          return old.filter((project) => project.id !== id)
        }
      )
      queryClient.removeQueries({ queryKey: QUERY_KEYS.project(id) })
      return { previousLists }
    },
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projects })
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.removeQueries({ queryKey: QUERY_KEYS.project(id) })
      toast({
        title: t('common.success'),
        description: t('projects.deleteSuccess'),
      })
    },
    onError: (error: unknown, _vars, context) => {
      context?.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data)
      })
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, t, 'common.error'),
        variant: 'destructive',
      })
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectMemoryApi } from '@/lib/api/project-memory'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import type { ProjectMemoryUpdateRequest } from '@/lib/types/project-memory'

export function useProjectMemory(projectId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.projectMemory(projectId ?? ''),
    queryFn: () => projectMemoryApi.get(projectId!),
    enabled: !!projectId,
  })
}

export function useUpdateProjectMemory(projectId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: ProjectMemoryUpdateRequest) =>
      projectMemoryApi.update(projectId, data),
    onSuccess: (result) => {
      queryClient.setQueryData(QUERY_KEYS.projectMemory(projectId), result)
      toast({
        title: t('common.success'),
        description: t('projects.projectMemorySaved'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('projects.failedToSaveProjectMemory')),
        variant: 'destructive',
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectMemory(projectId),
      })
    },
  })
}

export function useClearProjectMemory(projectId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: () => projectMemoryApi.clear(projectId),
    onSuccess: () => {
      queryClient.setQueryData(QUERY_KEYS.projectMemory(projectId), null)
      toast({
        title: t('common.success'),
        description: t('projects.projectMemoryCleared'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('projects.failedToClearProjectMemory')),
        variant: 'destructive',
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectMemory(projectId),
      })
    },
  })
}

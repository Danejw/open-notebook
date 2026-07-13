import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeApi } from '@/lib/api/knowledge'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorKey } from '@/lib/utils/error-handler'

export const KNOWLEDGE_QUERY_KEYS = {
  extractors: (sourceId: string) => ['knowledge', 'extractors', sourceId] as const,
  source: (sourceId: string) => ['knowledge', 'source', sourceId] as const,
  projectEntities: (projectId: string, q?: string, type?: string) =>
    ['knowledge', 'project', projectId, q ?? '', type ?? ''] as const,
  entity: (projectId: string, entityId: string) =>
    ['knowledge', 'entity', projectId, entityId] as const,
}

export function useSourceExtractors(sourceId: string, enabled = true) {
  return useQuery({
    queryKey: KNOWLEDGE_QUERY_KEYS.extractors(sourceId),
    queryFn: () => knowledgeApi.listExtractors(sourceId),
    enabled: !!sourceId && enabled,
  })
}

export function useSourceKnowledge(sourceId: string, enabled = true) {
  return useQuery({
    queryKey: KNOWLEDGE_QUERY_KEYS.source(sourceId),
    queryFn: () => knowledgeApi.getSourceKnowledge(sourceId),
    enabled: !!sourceId && enabled,
  })
}

export function useProjectEntities(
  projectId: string,
  params?: { entity_type?: string; q?: string },
  enabled = true
) {
  return useQuery({
    queryKey: KNOWLEDGE_QUERY_KEYS.projectEntities(
      projectId,
      params?.q,
      params?.entity_type
    ),
    queryFn: () => knowledgeApi.listProjectEntities(projectId, params),
    enabled: !!projectId && enabled,
  })
}

export function useEntityDetail(
  projectId: string,
  entityId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: KNOWLEDGE_QUERY_KEYS.entity(projectId, entityId ?? ''),
    queryFn: () => knowledgeApi.getEntityDetail(projectId, entityId!),
    enabled: !!projectId && !!entityId && enabled,
  })
}

export function useExtractKnowledge(sourceId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      extractor: string
      project_id?: string
      force?: boolean
    }) => knowledgeApi.extract(sourceId, data),
    onSuccess: () => {
      toast.success(t('knowledge.extractQueued'))
      queryClient.invalidateQueries({
        queryKey: KNOWLEDGE_QUERY_KEYS.extractors(sourceId),
      })
      queryClient.invalidateQueries({
        queryKey: KNOWLEDGE_QUERY_KEYS.source(sourceId),
      })
    },
    onError: (error: Error) => {
      toast.error(t('knowledge.extractFailed'), {
        description: t(getApiErrorKey(error.message)),
      })
    },
  })
}

export function useRebuildProjectKnowledge(projectId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => knowledgeApi.rebuildProject(projectId),
    onSuccess: (data: { jobs_submitted?: number }) => {
      toast.success(
        t('knowledge.rebuildQueued').replace(
          '{count}',
          String(data?.jobs_submitted ?? 0)
        )
      )
      queryClient.invalidateQueries({
        queryKey: ['knowledge', 'project', projectId],
      })
    },
    onError: (error: Error) => {
      toast.error(t('knowledge.rebuildFailed'), {
        description: t(getApiErrorKey(error.message)),
      })
    },
  })
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { artifactTemplatesApi } from '@/lib/api/artifact-templates'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import {
  CreateArtifactRequest,
  UpdateArtifactRequest,
  ExecuteArtifactRequest
} from '@/lib/types/artifacts'

export function useArtifacts() {
  return useQuery({
    queryKey: QUERY_KEYS.artifacts,
    queryFn: () => artifactTemplatesApi.list(),
    staleTime: 0,
    refetchOnMount: true,
  })
}

export function useArtifact(id?: string, options?: { enabled?: boolean }) {
  const artifactId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.artifact(artifactId),
    queryFn: () => artifactTemplatesApi.get(artifactId),
    enabled: !!artifactId && (options?.enabled ?? true),
  })
}

export function useCreateArtifact() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateArtifactRequest) => artifactTemplatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifacts })
      toast({
        title: t('common.success'),
        description: t('artifacts.createSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateArtifact() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateArtifactRequest }) =>
      artifactTemplatesApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifacts })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifact(id) })
      toast({
        title: t('common.success'),
        description: t('artifacts.updateSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteArtifact() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => artifactTemplatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifacts })
      toast({
        title: t('common.success'),
        description: t('artifacts.deleteSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useExecuteArtifact() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: ExecuteArtifactRequest) => artifactTemplatesApi.execute(data),
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useDefaultPrompt() {
  return useQuery({
    queryKey: QUERY_KEYS.artifactDefaultPrompt,
    queryFn: () => artifactTemplatesApi.getDefaultPrompt(),
  })
}

export function useUpdateDefaultPrompt() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (prompt: { artifact_instructions: string }) =>
      artifactTemplatesApi.updateDefaultPrompt(prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifactDefaultPrompt })
      toast({
        title: t('common.success'),
        description: t('artifacts.updateSuccess'),
      })
    },
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

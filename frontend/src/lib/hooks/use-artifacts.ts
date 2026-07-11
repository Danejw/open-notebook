import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { artifactsApi } from '@/lib/api/artifacts'
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
    queryFn: () => artifactsApi.list(),
  })
}

export function useArtifact(id?: string, options?: { enabled?: boolean }) {
  const artifactId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.artifact(artifactId),
    queryFn: () => artifactsApi.get(artifactId),
    enabled: !!artifactId && (options?.enabled ?? true),
  })
}

export function useCreateArtifact() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateArtifactRequest) => artifactsApi.create(data),
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
      artifactsApi.update(id, data),
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
    mutationFn: (id: string) => artifactsApi.delete(id),
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
    mutationFn: (data: ExecuteArtifactRequest) => artifactsApi.execute(data),
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
    queryFn: () => artifactsApi.getDefaultPrompt(),
  })
}

export function useUpdateDefaultPrompt() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (prompt: { artifact_instructions: string }) => artifactsApi.updateDefaultPrompt(prompt),
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

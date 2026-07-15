import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '@/lib/api/media'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import type { UpdateMediaAssetRequest } from '@/lib/types/media'

export function useMediaAssets(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.mediaAssets,
    queryFn: () => mediaApi.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: options?.enabled ?? true,
  })
}

export function useUploadMediaAsset() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({
      file,
      name,
      slug,
    }: {
      file: File
      name?: string
      slug?: string
    }) => mediaApi.upload(file, { name, slug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mediaAssets })
      toast({
        title: t('common.success'),
        description: t('images.uploadSuccess'),
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

export function useUpdateMediaAsset() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMediaAssetRequest }) =>
      mediaApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mediaAssets })
      toast({
        title: t('common.success'),
        description: t('images.updateSuccess'),
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

export function useDeleteMediaAsset() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => mediaApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mediaAssets })
      toast({
        title: t('common.success'),
        description: t('images.deleteSuccess'),
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

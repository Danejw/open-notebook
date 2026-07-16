import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collectionsApi } from '@/lib/api/collections'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import {
  CollectionImportConfirmRequest,
  CreateCollectionRequest,
  ReplaceCollectionItemsRequest,
  UpdateCollectionRequest,
} from '@/lib/types/collections'

export function useCollections(archived = false) {
  return useQuery({
    queryKey: [...QUERY_KEYS.collections, { archived }] as const,
    queryFn: () => collectionsApi.list(archived),
  })
}

export function useCollection(id?: string, options?: { enabled?: boolean }) {
  const collectionId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.collection(collectionId),
    queryFn: () => collectionsApi.get(collectionId),
    enabled: !!collectionId && (options?.enabled ?? true),
  })
}

export function useCollectionsCatalog(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.collectionsCatalog,
    queryFn: () => collectionsApi.catalog(),
    enabled: options?.enabled ?? true,
  })
}

export function useCreateCollection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateCollectionRequest) => collectionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
      toast({
        title: t('common.success'),
        description: t('collections.createSuccess'),
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

export function useUpdateCollection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCollectionRequest }) =>
      collectionsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collection(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
      toast({
        title: t('common.success'),
        description: t('collections.updateSuccess'),
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

export function useReplaceCollectionItems() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReplaceCollectionItemsRequest }) =>
      collectionsApi.replaceItems(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collection(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
      toast({
        title: t('common.success'),
        description: t('collections.itemsSaved'),
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

export function useDeleteCollection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
      toast({
        title: t('common.success'),
        description: t('collections.deleteSuccess'),
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

export function useArchiveCollection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => collectionsApi.archive(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collection(id) })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
      toast({
        title: t('common.success'),
        description: t('collections.archiveSuccess'),
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

export function useDuplicateCollection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => collectionsApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
      toast({
        title: t('common.success'),
        description: t('collections.duplicateSuccess'),
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

export function useValidateCollection() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => collectionsApi.validate(id),
    onSuccess: (result, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collection(id) })
      toast({
        title: result.valid ? t('common.success') : t('collections.validationFailed'),
        description: result.valid
          ? t('collections.validationPassed')
          : t('collections.validationIssues').replace(
              '{count}',
              result.issues.length.toString()
            ),
        variant: result.valid ? 'default' : 'destructive',
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

export function useImportCollectionPreview() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (file: File) => collectionsApi.importPreview(file),
    onError: (error: unknown) => {
      toast({
        title: t('common.error'),
        description: getApiErrorMessage(error, (key) => t(key)),
        variant: 'destructive',
      })
    },
  })
}

export function useImportCollectionConfirm() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CollectionImportConfirmRequest) =>
      collectionsApi.importConfirm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collections })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.collectionsCatalog })
      toast({
        title: t('common.success'),
        description: t('collections.importSuccess'),
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

export function useExportCollection() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => collectionsApi.export(id),
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: t('collections.exportSuccess'),
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

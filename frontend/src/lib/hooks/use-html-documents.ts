import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { htmlDocumentsApi } from '@/lib/api/html-documents'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import type {
  CreateBidDocumentRequest,
  CreateHtmlTemplateRequest,
  DuplicateBidDocumentRequest,
  UpdateBidDocumentRequest,
  UpdateHtmlTemplateRequest,
} from '@/lib/types/html-documents'

export function useHtmlTemplates(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.htmlTemplates,
    queryFn: () => htmlDocumentsApi.listTemplates(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: options?.enabled ?? true,
  })
}

export function useHtmlTemplate(id?: string) {
  const templateId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.htmlTemplate(templateId),
    queryFn: () => htmlDocumentsApi.getTemplate(templateId),
    enabled: !!templateId,
  })
}

export function useCreateHtmlTemplate() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateHtmlTemplateRequest) =>
      htmlDocumentsApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.htmlTemplates })
      toast({
        title: t('common.success'),
        description: t('templates.templateCreateSuccess'),
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

export function useUpdateHtmlTemplate() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHtmlTemplateRequest }) =>
      htmlDocumentsApi.updateTemplate(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.htmlTemplates })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.htmlTemplate(variables.id),
      })
      toast({
        title: t('common.success'),
        description: t('templates.templateUpdateSuccess'),
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

export function useDeleteHtmlTemplate() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => htmlDocumentsApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.htmlTemplates })
      toast({
        title: t('common.success'),
        description: t('templates.templateDeleteSuccess'),
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

export function useProjectDocuments(projectId?: string) {
  const id = projectId ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.projectDocuments(id),
    queryFn: () => htmlDocumentsApi.listDocuments(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: true,
  })
}

export function useBidDocument(id?: string) {
  const documentId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.bidDocument(documentId),
    queryFn: () => htmlDocumentsApi.getDocument(documentId),
    enabled: !!documentId,
  })
}

export function useCreateBidDocument() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string
      data: CreateBidDocumentRequest
    }) => htmlDocumentsApi.createDocument(projectId, data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectDocuments(doc.project_id),
      })
      toast({
        title: t('common.success'),
        description: t('documents.createSuccess'),
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

export function useUpdateBidDocument() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBidDocumentRequest }) =>
      htmlDocumentsApi.updateDocument(id, data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.bidDocument(doc.id) })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectDocuments(doc.project_id),
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

export function useDuplicateBidDocument() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: DuplicateBidDocumentRequest
    }) => htmlDocumentsApi.duplicateDocument(id, data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectDocuments(doc.project_id),
      })
      toast({
        title: t('common.success'),
        description: t('documents.duplicateSuccess'),
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

export function useDeleteBidDocument() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({
      id,
      projectId,
    }: {
      id: string
      projectId: string
    }) => htmlDocumentsApi.deleteDocument(id).then(() => ({ id, projectId })),
    onSuccess: ({ id, projectId }) => {
      queryClient.removeQueries({ queryKey: QUERY_KEYS.bidDocument(id) })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectDocuments(projectId),
      })
      toast({
        title: t('common.success'),
        description: t('documents.deleteSuccess'),
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

export function useExportBidDocumentPdf() {
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => htmlDocumentsApi.exportPdf(id),
    onSuccess: () => {
      toast({
        title: t('common.success'),
        description: t('documents.exportSuccess'),
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

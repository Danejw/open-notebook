import apiClient from '@/lib/api/client'
import { sanitizeExportFilename } from '@/lib/utils/export-artifact'
import { triggerBlobDownload } from '@/lib/utils/blob-download'
import type {
  BidDocument,
  CreateBidDocumentRequest,
  CreateHtmlTemplateRequest,
  DuplicateBidDocumentRequest,
  HtmlTemplate,
  UpdateBidDocumentRequest,
  UpdateHtmlTemplateRequest,
} from '@/lib/types/html-documents'

function parseFilenameFromDisposition(header?: string): string | null {
  if (!header) return null
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header)
  return plainMatch?.[1] ?? null
}

export const htmlDocumentsApi = {
  listTemplates: async () => {
    const response = await apiClient.get<HtmlTemplate[]>('/templates/html')
    return response.data
  },

  getTemplate: async (id: string) => {
    const response = await apiClient.get<HtmlTemplate>(`/templates/html/${id}`)
    return response.data
  },

  createTemplate: async (data: CreateHtmlTemplateRequest) => {
    const response = await apiClient.post<HtmlTemplate>('/templates/html', data)
    return response.data
  },

  updateTemplate: async (id: string, data: UpdateHtmlTemplateRequest) => {
    const response = await apiClient.patch<HtmlTemplate>(`/templates/html/${id}`, data)
    return response.data
  },

  deleteTemplate: async (id: string) => {
    await apiClient.delete(`/templates/html/${id}`)
  },

  getDocument: async (id: string) => {
    const response = await apiClient.get<BidDocument>(`/documents/${id}`)
    return response.data
  },

  createDocument: async (projectId: string, data: CreateBidDocumentRequest) => {
    const response = await apiClient.post<BidDocument>(
      `/projects/${projectId}/documents`,
      data
    )
    return response.data
  },

  updateDocument: async (id: string, data: UpdateBidDocumentRequest) => {
    const response = await apiClient.patch<BidDocument>(`/documents/${id}`, data)
    return response.data
  },

  duplicateDocument: async (id: string, data: DuplicateBidDocumentRequest) => {
    const response = await apiClient.post<BidDocument>(
      `/documents/${id}/duplicate`,
      data
    )
    return response.data
  },

  deleteDocument: async (id: string) => {
    await apiClient.delete(`/documents/${id}`)
  },

  renderPdfFromHtml: async (data: { html_body: string; title?: string }) => {
    const response = await apiClient.post<Blob>('/documents/render.pdf', data, {
      responseType: 'blob',
    })
    const filename =
      parseFilenameFromDisposition(
        response.headers?.['content-disposition'] as string | undefined
      ) || `${sanitizeExportFilename(data.title || 'document')}.pdf`

    triggerBlobDownload(response.data, filename)
    return { filename }
  },

  exportPdf: async (id: string) => {
    const response = await apiClient.get<Blob>(`/documents/${id}/export.pdf`, {
      responseType: 'blob',
    })
    const filename =
      parseFilenameFromDisposition(
        response.headers?.['content-disposition'] as string | undefined
      ) || `${sanitizeExportFilename('document')}.pdf`

    triggerBlobDownload(response.data, filename)
    return { filename }
  },
}

import apiClient from './client'
import { NoteResponse, CreateNoteRequest, UpdateNoteRequest, PromoteToSourceRequest, SourceResponse } from '@/lib/types/api'
import { normalizeNoteId, sanitizeExportFilename } from '@/lib/utils/export-note'

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

function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(blobUrl)
}

export const notesApi = {
  list: async (params?: { project_id?: string }) => {
    const response = await apiClient.get<NoteResponse[]>('/notes', { params })
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<NoteResponse>(`/notes/${id}`)
    return response.data
  },

  create: async (data: CreateNoteRequest) => {
    const response = await apiClient.post<NoteResponse>('/notes', data)
    return response.data
  },

  update: async (id: string, data: UpdateNoteRequest) => {
    const response = await apiClient.put<NoteResponse>(`/notes/${id}`, data)
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/notes/${id}`)
  },

  ingestAsSource: async (id: string, data: PromoteToSourceRequest = {}) => {
    const response = await apiClient.post<SourceResponse>(`/notes/${id}/ingest-as-source`, data)
    return response.data
  },

  exportPdf: async (id: string) => {
    const normalizedId = normalizeNoteId(id)
    const response = await apiClient.get<Blob>(`/notes/${normalizedId}/export/pdf`, {
      responseType: 'blob',
    })
    const filename =
      parseFilenameFromDisposition(response.headers?.['content-disposition'] as string | undefined) ||
      `${sanitizeExportFilename('artifact')}.pdf`

    triggerBlobDownload(response.data, filename)
    return { filename }
  },
}
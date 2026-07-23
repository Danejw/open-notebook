import apiClient from './client'
import {
  ProjectArtifactResponse,
  CreateProjectArtifactRequest,
  UpdateProjectArtifactRequest,
} from '@/lib/types/api'
import { normalizeArtifactId, sanitizeExportFilename } from '@/lib/utils/export-artifact'

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

export const projectArtifactsApi = {
  list: async (params?: { project_id?: string }) => {
    const response = await apiClient.get<ProjectArtifactResponse[]>('/project-artifacts', {
      params,
    })
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<ProjectArtifactResponse>(`/project-artifacts/${id}`)
    return response.data
  },

  create: async (data: CreateProjectArtifactRequest) => {
    const response = await apiClient.post<ProjectArtifactResponse>('/project-artifacts', data)
    return response.data
  },

  update: async (id: string, data: UpdateProjectArtifactRequest) => {
    const response = await apiClient.put<ProjectArtifactResponse>(
      `/project-artifacts/${id}`,
      data
    )
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/project-artifacts/${id}`)
  },

  exportPdf: async (id: string) => {
    const normalizedId = normalizeArtifactId(id)
    const response = await apiClient.get<Blob>(`/project-artifacts/${normalizedId}/export/pdf`, {
      responseType: 'blob',
    })
    const filename =
      parseFilenameFromDisposition(response.headers?.['content-disposition'] as string | undefined) ||
      `${sanitizeExportFilename('artifact')}.pdf`

    triggerBlobDownload(response.data, filename)
    return { filename }
  },
}

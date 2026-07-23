import apiClient from '@/lib/api/client'
import {
  BulkImportConfirmRequest,
  BulkImportConfirmResult,
  BulkImportPreview,
  Skill,
  SkillCatalogItem,
  SkillDetail,
  SkillFileMoveRequest,
  SkillFileUpsertRequest,
  UpdateSkillRequest,
  ValidationResult,
} from '@/lib/types/skills'

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

export const skillsApi = {
  list: async (archived = false) => {
    const response = await apiClient.get<Skill[]>('/skills', {
      params: { archived },
    })
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<SkillDetail>(`/skills/${id}`)
    return response.data
  },

  update: async (id: string, data: UpdateSkillRequest) => {
    const response = await apiClient.put<Skill>(`/skills/${id}`, data)
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/skills/${id}`)
  },

  archive: async (id: string, archived = true) => {
    const response = await apiClient.post<Skill>(`/skills/${id}/archive`, null, {
      params: { archived },
    })
    return response.data
  },

  importPreviewBulk: async (files: File[]) => {
    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file)
    }
    const response = await apiClient.post<BulkImportPreview>(
      '/skills/import/preview-bulk',
      formData
    )
    return response.data
  },

  importConfirmBulk: async (data: BulkImportConfirmRequest) => {
    const response = await apiClient.post<BulkImportConfirmResult>(
      '/skills/import/confirm-bulk',
      data
    )
    return response.data
  },

  upsertFile: async (id: string, data: SkillFileUpsertRequest) => {
    const response = await apiClient.put<SkillDetail>(`/skills/${id}/file`, data)
    return response.data
  },

  moveFile: async (id: string, data: SkillFileMoveRequest) => {
    const response = await apiClient.post<SkillDetail>(`/skills/${id}/files/move`, data)
    return response.data
  },

  deleteFile: async (id: string, path: string) => {
    const response = await apiClient.delete<SkillDetail>(`/skills/${id}/file`, {
      params: { path },
    })
    return response.data
  },

  validate: async (id: string) => {
    const response = await apiClient.post<ValidationResult>(`/skills/${id}/validate`)
    return response.data
  },

  export: async (id: string) => {
    const response = await apiClient.get<Blob>(`/skills/${id}/export`, {
      responseType: 'blob',
    })
    const filename =
      parseFilenameFromDisposition(response.headers?.['content-disposition'] as string | undefined) ||
      `skill-${id}.zip`

    const blobUrl = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(blobUrl)

    return { filename }
  },

  catalog: async () => {
    const response = await apiClient.get<SkillCatalogItem[]>('/skills/catalog')
    return response.data
  },
}

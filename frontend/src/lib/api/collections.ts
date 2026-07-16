import apiClient from '@/lib/api/client'
import {
  Collection,
  CollectionCatalogItem,
  CollectionDetail,
  CollectionImportConfirmRequest,
  CollectionImportPreview,
  CreateCollectionRequest,
  ReplaceCollectionItemsRequest,
  UpdateCollectionRequest,
  ValidationResult,
} from '@/lib/types/collections'

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

export const collectionsApi = {
  list: async (archived = false) => {
    const response = await apiClient.get<Collection[]>('/collections', {
      params: { archived },
    })
    return response.data
  },

  catalog: async () => {
    const response = await apiClient.get<CollectionCatalogItem[]>(
      '/collections/catalog'
    )
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<CollectionDetail>(`/collections/${id}`)
    return response.data
  },

  create: async (data: CreateCollectionRequest) => {
    const response = await apiClient.post<CollectionDetail>('/collections', data)
    return response.data
  },

  update: async (id: string, data: UpdateCollectionRequest) => {
    const response = await apiClient.put<Collection>(`/collections/${id}`, data)
    return response.data
  },

  replaceItems: async (id: string, data: ReplaceCollectionItemsRequest) => {
    const response = await apiClient.put<CollectionDetail>(
      `/collections/${id}/items`,
      data
    )
    return response.data
  },

  duplicate: async (id: string) => {
    const response = await apiClient.post<CollectionDetail>(
      `/collections/${id}/duplicate`
    )
    return response.data
  },

  archive: async (id: string) => {
    const response = await apiClient.post<Collection>(`/collections/${id}/archive`)
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/collections/${id}`)
  },

  validate: async (id: string) => {
    const response = await apiClient.post<ValidationResult>(
      `/collections/${id}/validate`
    )
    return response.data
  },

  importPreview: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<CollectionImportPreview>(
      '/collections/import/preview',
      formData
    )
    return response.data
  },

  importConfirm: async (data: CollectionImportConfirmRequest) => {
    const response = await apiClient.post<CollectionDetail>(
      '/collections/import/confirm',
      data
    )
    return response.data
  },

  export: async (id: string) => {
    const response = await apiClient.get<Blob>(`/collections/${id}/export`, {
      responseType: 'blob',
    })
    const filename =
      parseFilenameFromDisposition(
        response.headers['content-disposition'] as string | undefined
      ) ?? `collection-${id}.zip`
    const url = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}

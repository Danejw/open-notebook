import apiClient from '@/lib/api/client'
import type { MediaAsset, UpdateMediaAssetRequest } from '@/lib/types/media'

export const mediaApi = {
  list: async () => {
    const response = await apiClient.get<MediaAsset[]>('/media')
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<MediaAsset>(`/media/${id}`)
    return response.data
  },

  getBySlug: async (slug: string) => {
    const response = await apiClient.get<MediaAsset>(`/media/by-slug/${slug}`)
    return response.data
  },

  upload: async (file: File, options?: { name?: string; slug?: string }) => {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.name) formData.append('name', options.name)
    if (options?.slug) formData.append('slug', options.slug)
    const response = await apiClient.post<MediaAsset>('/media', formData)
    return response.data
  },

  update: async (id: string, data: UpdateMediaAssetRequest) => {
    const response = await apiClient.patch<MediaAsset>(`/media/${id}`, data)
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/media/${id}`)
  },

  /** Fetch raw image bytes with auth (for thumbnails / iframe preview). */
  fetchFileBlob: async (id: string) => {
    const response = await apiClient.get<Blob>(`/media/${id}/file`, {
      responseType: 'blob',
    })
    return response.data
  },
}

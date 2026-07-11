import apiClient from './client'
import {
  ProjectResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectDeletePreview,
  ProjectDeleteResponse,
} from '@/lib/types/api'

export const projectsApi = {
  list: async (params?: { archived?: boolean; order_by?: string }) => {
    const response = await apiClient.get<ProjectResponse[]>('/projects', { params })
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<ProjectResponse>(`/projects/${id}`)
    return response.data
  },

  create: async (data: CreateProjectRequest) => {
    const response = await apiClient.post<ProjectResponse>('/projects', data)
    return response.data
  },

  update: async (id: string, data: UpdateProjectRequest) => {
    const response = await apiClient.put<ProjectResponse>(`/projects/${id}`, data)
    return response.data
  },

  deletePreview: async (id: string) => {
    const response = await apiClient.get<ProjectDeletePreview>(
      `/projects/${id}/delete-preview`
    )
    return response.data
  },

  delete: async (id: string, deleteExclusiveSources: boolean = false) => {
    const response = await apiClient.delete<ProjectDeleteResponse>(`/projects/${id}`, {
      params: { delete_exclusive_sources: deleteExclusiveSources },
    })
    return response.data
  },

  addSource: async (projectId: string, sourceId: string) => {
    const response = await apiClient.post(`/projects/${projectId}/sources/${sourceId}`)
    return response.data
  },

  removeSource: async (projectId: string, sourceId: string) => {
    const response = await apiClient.delete(`/projects/${projectId}/sources/${sourceId}`)
    return response.data
  },
}
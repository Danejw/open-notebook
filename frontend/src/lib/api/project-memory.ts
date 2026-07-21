import apiClient from '@/lib/api/client'
import type {
  ProjectMemoryResponse,
  ProjectMemoryUpdateRequest,
} from '@/lib/types/project-memory'

export const projectMemoryApi = {
  get: async (projectId: string): Promise<ProjectMemoryResponse | null> => {
    const response = await apiClient.get<ProjectMemoryResponse | null>(
      `/projects/${projectId}/memory`
    )
    return response.data
  },

  update: async (
    projectId: string,
    data: ProjectMemoryUpdateRequest
  ): Promise<ProjectMemoryResponse> => {
    const response = await apiClient.put<ProjectMemoryResponse>(
      `/projects/${projectId}/memory`,
      data
    )
    return response.data
  },

  clear: async (projectId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}/memory`)
  },
}

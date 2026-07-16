import apiClient from './client'
import {
  Artifact,
  CreateArtifactRequest,
  UpdateArtifactRequest,
  ExecuteArtifactRequest,
  ExecuteArtifactResponse,
  DefaultPrompt
} from '@/lib/types/artifacts'

export const artifactTemplatesApi = {
  list: async () => {
    const response = await apiClient.get<Artifact[]>('/artifact-templates')
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<Artifact>(`/artifact-templates/${id}`)
    return response.data
  },

  create: async (data: CreateArtifactRequest) => {
    const response = await apiClient.post<Artifact>('/artifact-templates', data)
    return response.data
  },

  update: async (id: string, data: UpdateArtifactRequest) => {
    const response = await apiClient.put<Artifact>(`/artifact-templates/${id}`, data)
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/artifact-templates/${id}`)
  },

  execute: async (data: ExecuteArtifactRequest) => {
    const response = await apiClient.post<ExecuteArtifactResponse>(
      '/artifact-templates/execute',
      data
    )
    return response.data
  },

  getDefaultPrompt: async () => {
    const response = await apiClient.get<DefaultPrompt>(
      '/artifact-templates/default-prompt'
    )
    return response.data
  },

  updateDefaultPrompt: async (prompt: { artifact_instructions: string }) => {
    const response = await apiClient.put<DefaultPrompt>(
      '/artifact-templates/default-prompt',
      prompt
    )
    return response.data
  }
}

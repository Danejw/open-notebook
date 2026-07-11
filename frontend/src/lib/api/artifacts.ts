import apiClient from './client'
import {
  Artifact,
  CreateArtifactRequest,
  UpdateArtifactRequest,
  ExecuteArtifactRequest,
  ExecuteArtifactResponse,
  DefaultPrompt
} from '@/lib/types/artifacts'

export const artifactsApi = {
  list: async () => {
    const response = await apiClient.get<Artifact[]>('/artifacts')
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<Artifact>(`/artifacts/${id}`)
    return response.data
  },

  create: async (data: CreateArtifactRequest) => {
    const response = await apiClient.post<Artifact>('/artifacts', data)
    return response.data
  },

  update: async (id: string, data: UpdateArtifactRequest) => {
    const response = await apiClient.put<Artifact>(`/artifacts/${id}`, data)
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/artifacts/${id}`)
  },

  execute: async (data: ExecuteArtifactRequest) => {
    const response = await apiClient.post<ExecuteArtifactResponse>('/artifacts/execute', data)
    return response.data
  },

  getDefaultPrompt: async () => {
    const response = await apiClient.get<DefaultPrompt>('/artifacts/default-prompt')
    return response.data
  },

  updateDefaultPrompt: async (prompt: { artifact_instructions: string }) => {
    const response = await apiClient.put<DefaultPrompt>('/artifacts/default-prompt', prompt)
    return response.data
  }
}
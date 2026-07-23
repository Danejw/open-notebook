import apiClient from './client'
import {
  Model,
  ModelDefaults,
  AutoAssignResult,
  ModelTestResult,
} from '@/lib/types/models'

export const modelsApi = {
  list: async () => {
    const response = await apiClient.get<Model[]>('/models')
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/models/${id}`)
  },

  getDefaults: async () => {
    const response = await apiClient.get<ModelDefaults>('/models/defaults')
    return response.data
  },

  updateDefaults: async (data: Partial<ModelDefaults>) => {
    const response = await apiClient.put<ModelDefaults>('/models/defaults', data)
    return response.data
  },

  /**
   * Auto-assign default models based on available models
   */
  autoAssign: async () => {
    const response = await apiClient.post<AutoAssignResult>('/models/auto-assign')
    return response.data
  },

  /**
   * Test an individual model configuration
   */
  testModel: async (modelId: string): Promise<ModelTestResult> => {
    const response = await apiClient.post<ModelTestResult>(`/models/${modelId}/test`)
    return response.data
  },
}

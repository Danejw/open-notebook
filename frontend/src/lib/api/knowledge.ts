import apiClient from '@/lib/api/client'

export interface KnowledgeExtractorInfo {
  id: string
  label: string
  version: string
  auto_run: boolean
  last_run?: {
    status?: string
    stats?: Record<string, number>
    started_at?: string
    finished_at?: string
    error_message?: string
  }
}

export interface KnowledgeEntity {
  id: string
  type: string
  label: string
  normalized_key?: string
  source_id?: string
  confidence?: number
  metadata?: Record<string, unknown>
}

export const knowledgeApi = {
  listExtractors: async (sourceId: string) => {
    const response = await apiClient.get<{ extractors: KnowledgeExtractorInfo[] }>(
      `/sources/${encodeURIComponent(sourceId)}/knowledge/extractors`
    )
    return response.data
  },

  extract: async (
    sourceId: string,
    data: { extractor: string; project_id?: string; force?: boolean }
  ) => {
    const response = await apiClient.post<{
      command_id: string
      source_id: string
      extractor: string
    }>(`/sources/${encodeURIComponent(sourceId)}/knowledge/extract`, data)
    return response.data
  },

  getSourceKnowledge: async (sourceId: string) => {
    const response = await apiClient.get<{
      entities: KnowledgeEntity[]
      claims: unknown[]
      relations: unknown[]
      runs: unknown[]
    }>(`/sources/${encodeURIComponent(sourceId)}/knowledge`)
    return response.data
  },

  listProjectEntities: async (
    projectId: string,
    params?: { entity_type?: string; q?: string; limit?: number }
  ) => {
    const response = await apiClient.get<{
      entities: KnowledgeEntity[]
      total_count: number
    }>(`/projects/${encodeURIComponent(projectId)}/knowledge/entities`, { params })
    return response.data
  },

  getEntityDetail: async (projectId: string, entityId: string) => {
    const response = await apiClient.get<{
      entity: KnowledgeEntity
      claims: Array<Record<string, unknown>>
      relations: Array<Record<string, unknown>>
    }>(
      `/projects/${encodeURIComponent(projectId)}/knowledge/entities/${encodeURIComponent(entityId)}`
    )
    return response.data
  },

  rebuildProject: async (
    projectId: string,
    data?: { force?: boolean; extractor?: string }
  ) => {
    const response = await apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/knowledge/rebuild`,
      data ?? { force: true, extractor: 'generic' }
    )
    return response.data
  },
}

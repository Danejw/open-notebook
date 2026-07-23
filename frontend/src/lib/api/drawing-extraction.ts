import { apiClient } from '@/lib/api/client'

export type DrawingExtractionJob = {
  source_id: string
  success: boolean
  run_id?: string
  command_id?: string
  status?: string
  error?: string
}

export type DrawingExtractionRun = {
  id: string
  source_id: string
  project_id?: string
  status: string
  active?: boolean
  file_hash?: string
  extractor_version?: string
  extraction_model?: string
  verification_model?: string
  embedding_model?: string
  page_count?: number
  drawing_page_count?: number
  stats?: Record<string, unknown>
  errors?: Array<Record<string, unknown>>
  started_at?: string
  finished_at?: string
  command_id?: string
}

export type DrawingRunDetail = {
  run: DrawingExtractionRun
  pages: Array<Record<string, unknown>>
  items: Array<Record<string, unknown>>
  regions: Array<Record<string, unknown>>
  relationships: Array<Record<string, unknown>>
  semantic_records: Array<Record<string, unknown>>
}

export const drawingExtractionApi = {
  extract: async (payload: {
    source_ids: string[]
    project_id?: string
    force?: boolean
  }) => {
    const { data } = await apiClient.post<{
      jobs: DrawingExtractionJob[]
      rejected: Array<{ source_id: string; error: string }>
    }>('/drawing-extractions/extract', payload)
    return data
  },

  listSourceRuns: async (sourceId: string) => {
    const { data } = await apiClient.get<{
      source_id: string
      runs: DrawingExtractionRun[]
    }>(`/drawing-extractions/sources/${encodeURIComponent(sourceId)}/runs`)
    return data
  },

  listProjectRuns: async (projectId: string) => {
    const { data } = await apiClient.get<{
      project_id: string
      runs: DrawingExtractionRun[]
    }>(`/drawing-extractions/projects/${encodeURIComponent(projectId)}/runs`)
    return data
  },

  getRun: async (runId: string) => {
    const { data } = await apiClient.get<DrawingRunDetail>(
      `/drawing-extractions/runs/${encodeURIComponent(runId)}`
    )
    return data
  },

  /** Fetch a rendered page image with auth (use as blob URL for <img>). */
  fetchPageImage: async (
    runId: string,
    pageId: string,
    kind: 'render' | 'thumb' = 'render'
  ): Promise<Blob> => {
    const { data } = await apiClient.get<Blob>(
      `/drawing-extractions/runs/${encodeURIComponent(runId)}/pages/${encodeURIComponent(pageId)}/image`,
      {
        params: { kind },
        responseType: 'blob',
      }
    )
    return data
  },

  activateRun: async (runId: string) => {
    const { data } = await apiClient.post<{ run: DrawingExtractionRun }>(
      `/drawing-extractions/runs/${encodeURIComponent(runId)}/activate`
    )
    return data
  },

  retryRun: async (runId: string, force = true) => {
    const { data } = await apiClient.post<{ jobs: DrawingExtractionJob[] }>(
      `/drawing-extractions/runs/${encodeURIComponent(runId)}/retry`,
      null,
      { params: { force } }
    )
    return data
  },
}

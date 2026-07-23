import apiClient from './client'

export interface EmbedContentRequest {
  item_id: string
  item_type: 'source' | 'note'
  async_processing?: boolean
  /** When false, embed sources without chaining knowledge graph. Default true. */
  chain_kg?: boolean
}

export interface EmbedContentResponse {
  success: boolean
  message: string
  chunks_created?: number
  command_id?: string
}

export interface RebuildEmbeddingsRequest {
  mode: 'existing' | 'all'
  include_sources?: boolean
  /** Canonical: include project artifacts */
  include_artifacts?: boolean
  /** @deprecated Prefer include_artifacts */
  include_notes?: boolean
  /**
   * When true, source embeds continue into knowledge-graph extraction.
   * Default false (embeddings only). More expensive when enabled.
   */
  chain_kg?: boolean
}

export interface RebuildEmbeddingsResponse {
  command_id: string
  message: string
  estimated_items: number
}

export interface RebuildProgress {
  total_items?: number
  processed_items?: number
  failed_items?: number
  total?: number
  processed?: number
  percentage?: number
}

export interface RebuildStats {
  sources_processed?: number
  notes_processed?: number
  sources?: number
  notes?: number
  failed?: number
  failed_items?: number
  processing_time?: number
}

export interface RebuildStatusResponse {
  command_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress?: RebuildProgress
  stats?: RebuildStats
  started_at?: string
  completed_at?: string
  error_message?: string
}

export interface EmbeddingDimensionHealth {
  expected_dimension: number | null
  source_embedding_matched: number
  source_embedding_mismatched: number
  note_matched: number
  note_mismatched: number
  mismatched_total: number
  indexed_total: number
  needs_rebuild: boolean
  dimensions_by_table: Record<string, Record<string, number>>
  message: string
}

export const embeddingApi = {
  embedContent: async (
    itemId: string,
    itemType: 'source' | 'note',
    options: { asyncProcessing?: boolean; chainKg?: boolean } = {}
  ): Promise<EmbedContentResponse> => {
    const response = await apiClient.post<EmbedContentResponse>('/embed', {
      item_id: itemId,
      item_type: itemType,
      async_processing: options.asyncProcessing ?? false,
      chain_kg: options.chainKg ?? true,
    })
    return response.data
  },

  getDimensionHealth: async (): Promise<EmbeddingDimensionHealth> => {
    const response = await apiClient.get<EmbeddingDimensionHealth>(
      '/embeddings/dimension-health'
    )
    return response.data
  },

  rebuildEmbeddings: async (request: RebuildEmbeddingsRequest): Promise<RebuildEmbeddingsResponse> => {
    const response = await apiClient.post<RebuildEmbeddingsResponse>('/embeddings/rebuild', request)
    return response.data
  },

  getRebuildStatus: async (commandId: string): Promise<RebuildStatusResponse> => {
    const response = await apiClient.get<RebuildStatusResponse>(`/embeddings/rebuild/${commandId}/status`)
    return response.data
  }
}

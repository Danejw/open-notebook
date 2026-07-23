// Search types
export interface SearchRequest {
  query: string
  /**
   * API default is auto (same retrieve() heuristics as project chat).
   * text = keyword only;
   * vector = dense similarity only (no RRF);
   * hybrid = BM25 + vector RRF;
   * auto = retrieve() heuristics (hybrid for identifiers, else vector).
   */
  type?: 'text' | 'vector' | 'hybrid' | 'auto'
  limit: number
  search_sources: boolean
  /** Canonical: include project artifacts in search */
  search_artifacts?: boolean
  /** @deprecated Prefer search_artifacts */
  search_notes: boolean
  minimum_score: number
  project_id?: string
}

export interface SearchResult {
  id: string
  title: string
  parent_id: string
  final_score: number
  matches?: string[]
  relevance?: number
  similarity?: number
  score?: number
  type?: string
  source_type?: string
  created: string
  updated: string
}

export interface SearchResponse {
  results: SearchResult[]
  total_count: number
  search_type: string
  /** Present when type is hybrid or auto */
  retrieval_mode_used?: string | null
  /** Present when indexed embedding dims drift from the active model */
  embedding_dim_warning?: string | null
}

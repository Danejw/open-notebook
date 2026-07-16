// Search types
export interface SearchRequest {
  query: string
  type: 'text' | 'vector' | 'hybrid'
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
}

// Ask types
export interface AskRequest {
  question: string
  strategy_model: string
  answer_model: string
  final_answer_model: string
  project_id?: string
  retrieval_mode?: 'auto' | 'vector' | 'hybrid' | 'graph'
}

export interface AskResponse {
  answer: string
  question: string
}

export interface StrategyData {
  reasoning: string
  searches: Array<{
    term: string
    instructions: string
  }>
}

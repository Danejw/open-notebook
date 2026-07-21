export interface ProjectMemoryResponse {
  project_id: string
  content: string
  evidence_ids: string[]
  revision: number
  last_reason: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ProjectMemoryUpdateRequest {
  content: string
}

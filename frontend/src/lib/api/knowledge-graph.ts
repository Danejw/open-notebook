import apiClient from '@/lib/api/client'

export type GraphNodeKind =
  | 'source'
  | 'chunk'
  | 'entity'
  | 'claim'
  | 'community'

export interface GraphNodeDTO {
  id: string
  kind: GraphNodeKind
  label: string
  subtype?: string | null
  description?: string | null
  degree: number
  source_count: number
  confidence?: number | null
  community_id?: string | null
  metadata: Record<string, unknown>
}

export interface GraphEdgeDTO {
  id: string
  source: string
  target: string
  relation: string
  directed: boolean
  weight: number
  confidence?: number | null
  evidence_count: number
  metadata: Record<string, unknown>
}

export interface GraphSliceDTO {
  nodes: GraphNodeDTO[]
  edges: GraphEdgeDTO[]
  graph_version: string
  truncated: boolean
  next_cursor?: string | null
  stats: {
    total_nodes: number
    total_edges: number
    visible_nodes: number
    visible_edges: number
  }
}

export interface GraphEvidenceDTO {
  chunk_id?: string | null
  source_id?: string | null
  source_title?: string | null
  chunk_order?: number | null
  snippet?: string | null
  confidence?: number | null
}

export interface GraphNodeDetailDTO extends GraphNodeDTO {
  aliases: string[]
  evidence: GraphEvidenceDTO[]
  neighbors: Array<{
    id: string
    kind: GraphNodeKind
    label: string
    relation?: string | null
  }>
  relation_counts: Record<string, number>
}

export interface GraphQueryRunResponse {
  run: {
    id: string
    project_id: string
    query: string
    retrieval_mode?: string | null
    seeds?: Record<string, unknown>
    paths?: unknown[]
    cited_ids?: Record<string, unknown>
    status: string
    metadata?: Record<string, unknown>
  }
  slice: GraphSliceDTO
}

export const knowledgeGraphApi = {
  getOverview: async (projectId: string, maxNodes = 450) => {
    const response = await apiClient.get<GraphSliceDTO>(
      `/knowledge-graph/projects/${encodeURIComponent(projectId)}/overview`,
      { params: { max_nodes: maxNodes } }
    )
    return response.data
  },

  getNode: async (nodeId: string, projectId: string) => {
    const response = await apiClient.get<GraphNodeDetailDTO>(
      `/knowledge-graph/nodes/${encodeURIComponent(nodeId)}`,
      { params: { project_id: projectId } }
    )
    return response.data
  },

  getNeighbors: async (
    nodeId: string,
    projectId: string,
    params?: {
      depth?: number
      relation_types?: string
      node_kinds?: string
      min_confidence?: number
      limit?: number
    }
  ) => {
    const response = await apiClient.get<GraphSliceDTO>(
      `/knowledge-graph/nodes/${encodeURIComponent(nodeId)}/neighbors`,
      {
        params: {
          project_id: projectId,
          ...params,
        },
      }
    )
    return response.data
  },

  search: async (projectId: string, q: string, limit = 30) => {
    const response = await apiClient.post<GraphSliceDTO>(
      `/knowledge-graph/search`,
      { project_id: projectId, q, limit }
    )
    return response.data
  },

  paths: async (
    projectId: string,
    fromId: string,
    toId: string,
    maxDepth = 4
  ) => {
    const response = await apiClient.post<GraphSliceDTO>(
      `/knowledge-graph/paths`,
      {
        project_id: projectId,
        from_id: fromId,
        to_id: toId,
        max_depth: maxDepth,
      }
    )
    return response.data
  },

  sourceSubgraph: async (sourceId: string, projectId: string) => {
    const response = await apiClient.get<GraphSliceDTO>(
      `/knowledge-graph/sources/${encodeURIComponent(sourceId)}/subgraph`,
      { params: { project_id: projectId } }
    )
    return response.data
  },

  getQueryRun: async (runId: string) => {
    const response = await apiClient.get<GraphQueryRunResponse>(
      `/knowledge-graph/query-runs/${encodeURIComponent(runId)}`
    )
    return response.data
  },

  getLayout: async (projectId: string, graphVersion?: number) => {
    const response = await apiClient.get<{
      layout: {
        id: string
        project_id: string
        graph_version: number
        positions: Record<string, { x: number; y: number }>
        algorithm?: string
      } | null
      graph_version?: number
    }>(`/knowledge-graph/projects/${encodeURIComponent(projectId)}/layout`, {
      params: graphVersion != null ? { graph_version: graphVersion } : undefined,
    })
    return response.data
  },

  saveLayout: async (
    projectId: string,
    data: {
      positions: Record<string, { x: number; y: number }>
      algorithm?: string
      graph_version?: number
    }
  ) => {
    const response = await apiClient.put(
      `/knowledge-graph/projects/${encodeURIComponent(projectId)}/layout`,
      data
    )
    return response.data
  },
}

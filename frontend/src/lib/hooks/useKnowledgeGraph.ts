import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  knowledgeGraphApi,
  type GraphSliceDTO,
} from '@/lib/api/knowledge-graph'

export const GRAPH_QUERY_KEYS = {
  overview: (projectId: string) =>
    ['knowledge-graph', 'overview', projectId] as const,
  node: (projectId: string, nodeId: string) =>
    ['knowledge-graph', 'node', projectId, nodeId] as const,
  layout: (projectId: string, version?: string) =>
    ['knowledge-graph', 'layout', projectId, version ?? ''] as const,
  queryRun: (runId: string) =>
    ['knowledge-graph', 'query-run', runId] as const,
  sourceSubgraph: (projectId: string, sourceId: string) =>
    ['knowledge-graph', 'source-subgraph', projectId, sourceId] as const,
}

export function useGraphOverview(projectId: string, enabled = true) {
  return useQuery({
    queryKey: GRAPH_QUERY_KEYS.overview(projectId),
    queryFn: () => knowledgeGraphApi.getOverview(projectId),
    enabled: !!projectId && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useGraphNode(
  projectId: string,
  nodeId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: GRAPH_QUERY_KEYS.node(projectId, nodeId ?? ''),
    queryFn: () => knowledgeGraphApi.getNode(nodeId!, projectId),
    enabled: !!projectId && !!nodeId && enabled,
  })
}

export function useGraphLayout(projectId: string, graphVersion?: string) {
  return useQuery({
    queryKey: GRAPH_QUERY_KEYS.layout(projectId, graphVersion),
    queryFn: () =>
      knowledgeGraphApi.getLayout(
        projectId,
        graphVersion ? Number(graphVersion) : undefined
      ),
    enabled: !!projectId,
  })
}

export function useSaveGraphLayout(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      positions: Record<string, { x: number; y: number; z?: number }>
      algorithm?: string
      graph_version?: number
    }) => knowledgeGraphApi.saveLayout(projectId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: GRAPH_QUERY_KEYS.layout(
          projectId,
          variables.graph_version != null
            ? String(variables.graph_version)
            : undefined
        ),
      })
    },
  })
}

export function useGraphQueryRun(runId: string | null, enabled = true) {
  return useQuery({
    queryKey: GRAPH_QUERY_KEYS.queryRun(runId ?? ''),
    queryFn: () => knowledgeGraphApi.getQueryRun(runId!),
    enabled: !!runId && enabled,
  })
}

export function useSourceSubgraph(
  projectId: string,
  sourceId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: GRAPH_QUERY_KEYS.sourceSubgraph(projectId, sourceId ?? ''),
    queryFn: () => knowledgeGraphApi.sourceSubgraph(sourceId!, projectId),
    enabled: !!projectId && !!sourceId && enabled,
  })
}

export function mergeSlices(
  base: GraphSliceDTO | undefined,
  extra: GraphSliceDTO
): GraphSliceDTO {
  if (!base) return extra
  const nodes = new Map(base.nodes.map((n) => [n.id, n]))
  const edges = new Map(base.edges.map((e) => [e.id, e]))
  for (const n of extra.nodes) nodes.set(n.id, n)
  for (const e of extra.edges) edges.set(e.id, e)
  return {
    ...extra,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    truncated: base.truncated || extra.truncated,
    stats: {
      total_nodes: Math.max(base.stats.total_nodes, extra.stats.total_nodes),
      total_edges: Math.max(base.stats.total_edges, extra.stats.total_edges),
      visible_nodes: nodes.size,
      visible_edges: edges.size,
    },
  }
}

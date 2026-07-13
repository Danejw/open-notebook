import Graph from 'graphology'
import type { GraphEdgeDTO, GraphNodeDTO, GraphSliceDTO } from '@/lib/api/knowledge-graph'
import { nodeColor, nodeSize } from '@/lib/graph/graph-styles'

export type KnowledgeGraphology = Graph

export function createEmptyGraph(): KnowledgeGraphology {
  return new Graph({ multi: true, allowSelfLoops: false, type: 'directed' })
}

export function upsertSlice(
  graph: KnowledgeGraphology,
  slice: GraphSliceDTO,
  options?: { replace?: boolean }
): KnowledgeGraphology {
  if (options?.replace) {
    graph.clear()
  }

  for (const node of slice.nodes) {
    upsertNode(graph, node)
  }
  for (const edge of slice.edges) {
    upsertEdge(graph, edge)
  }
  return graph
}

export function upsertNode(graph: KnowledgeGraphology, node: GraphNodeDTO): void {
  const attrs = {
    label: node.label,
    kind: node.kind,
    subtype: node.subtype ?? undefined,
    description: node.description ?? undefined,
    degree: node.degree,
    sourceCount: node.source_count,
    confidence: node.confidence ?? undefined,
    communityId: node.community_id ?? undefined,
    metadata: node.metadata,
    size: nodeSize(node),
    color: nodeColor(node),
    x: graph.hasNode(node.id)
      ? (graph.getNodeAttribute(node.id, 'x') as number)
      : Math.random() * 100,
    y: graph.hasNode(node.id)
      ? (graph.getNodeAttribute(node.id, 'y') as number)
      : Math.random() * 100,
  }
  if (graph.hasNode(node.id)) {
    graph.mergeNodeAttributes(node.id, attrs)
  } else {
    graph.addNode(node.id, attrs)
  }
}

export function upsertEdge(graph: KnowledgeGraphology, edge: GraphEdgeDTO): void {
  if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
    return
  }
  const attrs = {
    label: edge.relation,
    relation: edge.relation,
    weight: edge.weight,
    confidence: edge.confidence ?? undefined,
    evidenceCount: edge.evidence_count,
    metadata: edge.metadata,
    size: Math.max(0.5, Math.min(3, edge.weight)),
    color: '#94a3b8',
  }
  if (graph.hasEdge(edge.id)) {
    graph.mergeEdgeAttributes(edge.id, attrs)
  } else if (graph.hasEdge(edge.source, edge.target)) {
    // Prefer stable id edge key when multi allows
    try {
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, attrs)
    } catch {
      graph.mergeEdgeAttributes(graph.edge(edge.source, edge.target), attrs)
    }
  } else {
    graph.addEdgeWithKey(edge.id, edge.source, edge.target, attrs)
  }
}

export function applyPositions(
  graph: KnowledgeGraphology,
  positions: Record<string, { x: number; y: number }>
): void {
  for (const [id, pos] of Object.entries(positions)) {
    if (graph.hasNode(id) && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      graph.setNodeAttribute(id, 'x', pos.x)
      graph.setNodeAttribute(id, 'y', pos.y)
    }
  }
}

export function collectPositions(
  graph: KnowledgeGraphology
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  graph.forEachNode((id, attrs) => {
    positions[id] = {
      x: Number(attrs.x) || 0,
      y: Number(attrs.y) || 0,
    }
  })
  return positions
}

/** Place nodes that lack stable coords near the centroid of existing nodes. */
export function placeNewNodesNearExisting(
  graph: KnowledgeGraphology,
  newNodeIds: Iterable<string>
): void {
  const ids = Array.from(newNodeIds).filter((id) => graph.hasNode(id))
  if (ids.length === 0) return

  let sx = 0
  let sy = 0
  let count = 0
  graph.forEachNode((id, attrs) => {
    if (ids.includes(id)) return
    sx += Number(attrs.x) || 0
    sy += Number(attrs.y) || 0
    count += 1
  })
  const cx = count > 0 ? sx / count : 0
  const cy = count > 0 ? sy / count : 0

  ids.forEach((id, index) => {
    const angle = (index / Math.max(ids.length, 1)) * Math.PI * 2
    const radius = 40 + (index % 5) * 12
    graph.setNodeAttribute(id, 'x', cx + Math.cos(angle) * radius)
    graph.setNodeAttribute(id, 'y', cy + Math.sin(angle) * radius)
  })
}

/** Sync graph to slice while keeping the same Graph instance (Sigma-safe). */
export function syncGraphToSlice(
  graph: KnowledgeGraphology,
  slice: GraphSliceDTO,
  options?: { preservePositions?: Record<string, { x: number; y: number }> }
): { newNodeIds: string[] } {
  const preserve = options?.preservePositions ?? collectPositions(graph)
  const nextIds = new Set(slice.nodes.map((n) => n.id))
  const previousIds = new Set(graph.nodes())
  const newNodeIds: string[] = []

  for (const id of previousIds) {
    if (!nextIds.has(id)) {
      graph.dropNode(id)
    }
  }

  for (const node of slice.nodes) {
    const isNew = !previousIds.has(node.id)
    if (isNew) newNodeIds.push(node.id)
    upsertNode(graph, node)
    const pos = preserve[node.id]
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      graph.setNodeAttribute(node.id, 'x', pos.x)
      graph.setNodeAttribute(node.id, 'y', pos.y)
    }
  }

  const nextEdgeIds = new Set(slice.edges.map((e) => e.id))
  for (const edgeId of graph.edges()) {
    if (!nextEdgeIds.has(edgeId)) {
      try {
        graph.dropEdge(edgeId)
      } catch {
        // ignore
      }
    }
  }
  for (const edge of slice.edges) {
    upsertEdge(graph, edge)
  }

  if (newNodeIds.length > 0) {
    placeNewNodesNearExisting(graph, newNodeIds)
  }

  return { newNodeIds }
}

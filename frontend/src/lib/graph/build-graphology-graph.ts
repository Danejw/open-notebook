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
      : (Math.random() - 0.5) * 100,
    y: graph.hasNode(node.id)
      ? (graph.getNodeAttribute(node.id, 'y') as number)
      : (Math.random() - 0.5) * 100,
    z: graph.hasNode(node.id)
      ? (graph.getNodeAttribute(node.id, 'z') as number)
      : (Math.random() - 0.5) * 100,
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

export type GraphNodePosition = { x: number; y: number; z?: number }

export function applyPositions(
  graph: KnowledgeGraphology,
  positions: Record<string, GraphNodePosition>
): void {
  for (const [id, pos] of Object.entries(positions)) {
    if (graph.hasNode(id) && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      graph.setNodeAttribute(id, 'x', pos.x)
      graph.setNodeAttribute(id, 'y', pos.y)
      if (pos.z != null && Number.isFinite(pos.z)) {
        graph.setNodeAttribute(id, 'z', pos.z)
      }
    }
  }
}

export function collectPositions(
  graph: KnowledgeGraphology
): Record<string, GraphNodePosition> {
  const positions: Record<string, GraphNodePosition> = {}
  graph.forEachNode((id, attrs) => {
    positions[id] = {
      x: Number(attrs.x) || 0,
      y: Number(attrs.y) || 0,
      z: Number(attrs.z) || 0,
    }
  })
  return positions
}

/**
 * True when saved positions include real Z depth (not a flat / missing-z layout).
 * Used to decide whether we can freeze the camera on a saved layout or must
 * re-run a 3D force simulation.
 */
export function layoutHas3DDepth(
  positions: Record<string, GraphNodePosition>,
  minSpread = 5
): boolean {
  const entries = Object.values(positions)
  if (entries.length === 0) return false
  const zs = entries
    .map((p) => p.z)
    .filter((z): z is number => z != null && Number.isFinite(z))
  // Require z on most nodes so a few accidental z values don't count.
  if (zs.length < Math.max(3, Math.ceil(entries.length * 0.5))) return false
  const min = Math.min(...zs)
  const max = Math.max(...zs)
  return max - min >= minSpread
}

/**
 * Detect the old cold-load bug: nodes parked on concentric radius bands
 * from `placeNewNodesNearExisting` (`radius = 40 + (i % 5) * 12`).
 */
export function layoutLooksParametric(
  positions: Record<string, GraphNodePosition>
): boolean {
  const pts = Object.values(positions)
  if (pts.length < 20) return false

  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  cx /= pts.length
  cy /= pts.length

  // Exact bands produced by the old placer.
  const expectedRadii = [40, 52, 64, 76, 88]
  let nearBand = 0
  for (const p of pts) {
    const r = Math.hypot(p.x - cx, p.y - cy)
    if (expectedRadii.some((er) => Math.abs(r - er) < 4)) {
      nearBand += 1
    }
  }
  return nearBand / pts.length >= 0.55
}

/** Scatter all nodes into a random 3D cloud (force-layout seed). */
export function seedRandomNodePositions(
  graph: KnowledgeGraphology,
  spread = 100
): void {
  graph.forEachNode((id) => {
    graph.setNodeAttribute(id, 'x', (Math.random() - 0.5) * spread)
    graph.setNodeAttribute(id, 'y', (Math.random() - 0.5) * spread)
    graph.setNodeAttribute(id, 'z', (Math.random() - 0.5) * spread)
  })
}

/**
 * Place a small set of new nodes near the centroid of existing ones.
 * Uses random jitter (not parametric rings) so incremental inserts don't
 * create artificial arcs.
 */
export function placeNewNodesNearExisting(
  graph: KnowledgeGraphology,
  newNodeIds: Iterable<string>
): void {
  const ids = Array.from(newNodeIds).filter((id) => graph.hasNode(id))
  if (ids.length === 0) return

  let sx = 0
  let sy = 0
  let sz = 0
  let count = 0
  const idSet = new Set(ids)
  graph.forEachNode((id, attrs) => {
    if (idSet.has(id)) return
    sx += Number(attrs.x) || 0
    sy += Number(attrs.y) || 0
    sz += Number(attrs.z) || 0
    count += 1
  })
  // No existing nodes → leave upsertNode random seeds alone.
  if (count === 0) return

  const cx = sx / count
  const cy = sy / count
  const cz = sz / count
  const jitter = 60

  for (const id of ids) {
    graph.setNodeAttribute(id, 'x', cx + (Math.random() - 0.5) * jitter)
    graph.setNodeAttribute(id, 'y', cy + (Math.random() - 0.5) * jitter)
    graph.setNodeAttribute(id, 'z', cz + (Math.random() - 0.5) * jitter)
  }
}

/** Sync graph to slice while keeping the same Graph instance. */
export function syncGraphToSlice(
  graph: KnowledgeGraphology,
  slice: GraphSliceDTO,
  options?: { preservePositions?: Record<string, GraphNodePosition> }
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
      if (pos.z != null && Number.isFinite(pos.z)) {
        graph.setNodeAttribute(node.id, 'z', pos.z)
      }
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

  // Only nudge incremental inserts near existing nodes. Cold load (all new)
  // must keep random seeds so d3-force-3d can form a real cloud — never ring-place.
  const isColdLoad = previousIds.size === 0
  if (
    !isColdLoad &&
    newNodeIds.length > 0 &&
    newNodeIds.length < graph.order
  ) {
    placeNewNodesNearExisting(graph, newNodeIds)
  }

  return { newNodeIds }
}

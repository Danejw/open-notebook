import type { GraphNodeDTO, GraphNodeKind } from '@/lib/api/knowledge-graph'

const KIND_COLORS: Record<GraphNodeKind, string> = {
  source: '#0f766e',
  community: '#7c3aed',
  entity: '#2563eb',
  chunk: '#64748b',
  claim: '#d97706',
}

const TRACE_COLORS: Record<string, string> = {
  seed_chunk: '#2563eb',
  seed_entity: '#06b6d4',
  expanded_entity: '#06b6d4',
  path_entity: '#06b6d4',
  traversed: '#eab308',
  evidence: '#16a34a',
  cited_source: '#15803d',
  rejected: '#9ca3af',
}

export function nodeColor(node: GraphNodeDTO): string {
  const role = node.metadata?.trace_role
  if (typeof role === 'string' && TRACE_COLORS[role]) {
    return TRACE_COLORS[role]
  }
  return KIND_COLORS[node.kind] ?? '#64748b'
}

export function nodeSize(node: GraphNodeDTO): number {
  switch (node.kind) {
    case 'community':
      return Math.min(28, 14 + Math.sqrt(Math.max(node.degree, 1)) * 2)
    case 'source':
      return 12
    case 'chunk':
      return 5
    case 'claim':
      return 6
    case 'entity':
    default:
      return Math.min(18, 6 + Math.sqrt(Math.max(node.degree, 1)) * 1.5)
  }
}

export function edgeColorForTrace(metadata?: Record<string, unknown>): string {
  const role = metadata?.trace_role
  if (role === 'traversed') return '#eab308'
  if (role === 'rejected') return '#9ca3af'
  return '#94a3b8'
}

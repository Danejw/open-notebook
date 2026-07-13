import { describe, expect, it } from 'vitest'
import Graph from 'graphology'
import {
  layoutHas3DDepth,
  layoutLooksParametric,
  placeNewNodesNearExisting,
  seedRandomNodePositions,
  syncGraphToSlice,
} from '@/lib/graph/build-graphology-graph'
import type { GraphSliceDTO } from '@/lib/api/knowledge-graph'

function emptySlice(nodes: GraphSliceDTO['nodes']): GraphSliceDTO {
  return {
    nodes,
    edges: [],
    graph_version: '1',
    truncated: false,
    stats: {
      total_nodes: nodes.length,
      total_edges: 0,
      visible_nodes: nodes.length,
      visible_edges: 0,
    },
  }
}

describe('3D layout seeding', () => {
  it('detects missing z as not 3D', () => {
    expect(
      layoutHas3DDepth({
        a: { x: 0, y: 0 },
        b: { x: 1, y: 1 },
        c: { x: 2, y: 2 },
      })
    ).toBe(false)
  })

  it('detects real z spread as 3D', () => {
    expect(
      layoutHas3DDepth({
        a: { x: 0, y: 0, z: -40 },
        b: { x: 1, y: 1, z: 0 },
        c: { x: 2, y: 2, z: 40 },
        d: { x: 3, y: 3, z: 10 },
      })
    ).toBe(true)
  })

  it('detects concentric ring / parametric placement', () => {
    const positions: Record<string, { x: number; y: number; z?: number }> = {}
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2
      const radius = 40 + (i % 5) * 12
      positions[`n${i}`] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: Math.sin(angle * 1.7) * (radius * 0.4),
      }
    }
    expect(layoutLooksParametric(positions)).toBe(true)
  })

  it('does not ring-place on cold load', () => {
    const graph = new Graph()
    const nodes = Array.from({ length: 30 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      kind: 'entity' as const,
      degree: 1,
      source_count: 1,
      metadata: {},
    }))
    syncGraphToSlice(graph, emptySlice(nodes))

    const positions: Record<string, { x: number; y: number; z?: number }> = {}
    graph.forEachNode((id, attrs) => {
      positions[id] = {
        x: Number(attrs.x),
        y: Number(attrs.y),
        z: Number(attrs.z),
      }
    })
    expect(layoutLooksParametric(positions)).toBe(false)
  })

  it('only jitters incremental inserts near existing nodes', () => {
    const graph = new Graph()
    graph.addNode('existing', { x: 10, y: 20, z: 30, label: 'E' })
    placeNewNodesNearExisting(graph, ['missing'])
    expect(graph.hasNode('missing')).toBe(false)

    graph.addNode('new', { x: 0, y: 0, z: 0, label: 'N' })
    placeNewNodesNearExisting(graph, ['new'])
    const x = graph.getNodeAttribute('new', 'x') as number
    const y = graph.getNodeAttribute('new', 'y') as number
    const z = graph.getNodeAttribute('new', 'z') as number
    expect(Math.abs(x - 10)).toBeLessThan(40)
    expect(Math.abs(y - 20)).toBeLessThan(40)
    expect(Math.abs(z - 30)).toBeLessThan(40)
  })

  it('seedRandomNodePositions scatters nodes', () => {
    const graph = new Graph()
    for (let i = 0; i < 10; i++) {
      graph.addNode(`n${i}`, { x: 0, y: 0, z: 0 })
    }
    seedRandomNodePositions(graph, 100)
    const xs = graph.mapNodes((_id, attrs) => Number(attrs.x))
    expect(new Set(xs.map((v) => Math.round(v))).size).toBeGreaterThan(1)
  })
})

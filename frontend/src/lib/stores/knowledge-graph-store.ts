import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GraphNodeKind } from '@/lib/api/knowledge-graph'

export type GraphViewMode = 'explore' | 'queryTrace'
export type PathPickState = 'idle' | 'pickFrom' | 'pickTo'

/** Multiplier applied to base node radii (visual + hit target). */
export const NODE_SIZE_SCALE_MIN = 0.25
export const NODE_SIZE_SCALE_MAX = 1.5
export const NODE_SIZE_SCALE_DEFAULT = 1

interface KnowledgeGraphState {
  selectedNodeId: string | null
  selectedEdgeId: string | null
  highlightedSourceId: string | null
  provenanceMode: boolean
  showLabels: boolean
  /** Scales rendered node size and click targets. */
  nodeSizeScale: number
  viewMode: GraphViewMode
  queryRunId: string | null
  minConfidence: number
  enabledKinds: GraphNodeKind[]
  searchQuery: string
  pathPick: PathPickState
  pathFromId: string | null
  pathToId: string | null
  focusNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  setSelectedEdgeId: (id: string | null) => void
  setHighlightedSourceId: (id: string | null) => void
  setProvenanceMode: (value: boolean) => void
  setShowLabels: (value: boolean) => void
  setNodeSizeScale: (value: number) => void
  setViewMode: (mode: GraphViewMode) => void
  setQueryRunId: (id: string | null) => void
  setMinConfidence: (value: number) => void
  toggleKind: (kind: GraphNodeKind) => void
  setSearchQuery: (q: string) => void
  setPathPick: (state: PathPickState) => void
  setPathFromId: (id: string | null) => void
  setPathToId: (id: string | null) => void
  setFocusNodeId: (id: string | null) => void
  resetSelection: () => void
}

const DEFAULT_KINDS: GraphNodeKind[] = ['source', 'entity', 'community']

function clampNodeSizeScale(value: number): number {
  if (!Number.isFinite(value)) return NODE_SIZE_SCALE_DEFAULT
  return Math.min(NODE_SIZE_SCALE_MAX, Math.max(NODE_SIZE_SCALE_MIN, value))
}

export const useKnowledgeGraphStore = create<KnowledgeGraphState>()(
  persist(
    (set, get) => ({
      selectedNodeId: null,
      selectedEdgeId: null,
      highlightedSourceId: null,
      provenanceMode: false,
      showLabels: false,
      nodeSizeScale: NODE_SIZE_SCALE_DEFAULT,
      viewMode: 'explore',
      queryRunId: null,
      minConfidence: 0,
      enabledKinds: DEFAULT_KINDS,
      searchQuery: '',
      pathPick: 'idle',
      pathFromId: null,
      pathToId: null,
      focusNodeId: null,
      setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
      setSelectedEdgeId: (id) => set({ selectedEdgeId: id }),
      setHighlightedSourceId: (id) => set({ highlightedSourceId: id }),
      setProvenanceMode: (value) => {
        const kinds = new Set(get().enabledKinds)
        if (value) {
          kinds.add('chunk')
          kinds.add('claim')
        } else {
          kinds.delete('chunk')
          kinds.delete('claim')
        }
        set({ provenanceMode: value, enabledKinds: Array.from(kinds) })
      },
      setShowLabels: (value) => set({ showLabels: value }),
      setNodeSizeScale: (value) => set({ nodeSizeScale: clampNodeSizeScale(value) }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setQueryRunId: (id) => set({ queryRunId: id, viewMode: id ? 'queryTrace' : 'explore' }),
      setMinConfidence: (value) => set({ minConfidence: value }),
      toggleKind: (kind) => {
        const current = get().enabledKinds
        const next = current.includes(kind)
          ? current.filter((k) => k !== kind)
          : [...current, kind]
        set({ enabledKinds: next.length ? next : current })
      },
      setSearchQuery: (q) => set({ searchQuery: q }),
      setPathPick: (state) => set({ pathPick: state }),
      setPathFromId: (id) => set({ pathFromId: id }),
      setPathToId: (id) => set({ pathToId: id }),
      setFocusNodeId: (id) => set({ focusNodeId: id }),
      resetSelection: () =>
        set({
          selectedNodeId: null,
          selectedEdgeId: null,
          highlightedSourceId: null,
          pathPick: 'idle',
          pathFromId: null,
          pathToId: null,
          focusNodeId: null,
        }),
    }),
    {
      name: 'knowledge-graph-storage',
      partialize: (state) => ({
        provenanceMode: state.provenanceMode,
        showLabels: state.showLabels,
        nodeSizeScale: state.nodeSizeScale,
        minConfidence: state.minConfidence,
        enabledKinds: state.enabledKinds,
      }),
    }
  )
)

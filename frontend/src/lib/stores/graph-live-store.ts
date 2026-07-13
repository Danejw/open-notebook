import { create } from 'zustand'

export interface GraphLiveCompletion {
  projectId: string
  sourceId: string
  token: number
}

interface GraphLiveState {
  lastCompleted: GraphLiveCompletion | null
  /** Sources currently in knowledge_graph pipeline stage, keyed by project. */
  updatingByProject: Record<string, Record<string, true>>
  notifySourceKnowledgeReady: (projectId: string, sourceId: string) => void
  setSourceUpdating: (
    projectId: string,
    sourceId: string,
    updating: boolean
  ) => void
  isProjectUpdating: (projectId: string) => boolean
}

export const useGraphLiveStore = create<GraphLiveState>((set, get) => ({
  lastCompleted: null,
  updatingByProject: {},
  notifySourceKnowledgeReady: (projectId, sourceId) => {
    if (!projectId || !sourceId) return
    set((state) => ({
      lastCompleted: {
        projectId,
        sourceId,
        token: (state.lastCompleted?.token ?? 0) + 1,
      },
      updatingByProject: {
        ...state.updatingByProject,
        [projectId]: (() => {
          const next = { ...(state.updatingByProject[projectId] ?? {}) }
          delete next[sourceId]
          return next
        })(),
      },
    }))
  },
  setSourceUpdating: (projectId, sourceId, updating) => {
    if (!projectId || !sourceId) return
    set((state) => {
      const projectMap = { ...(state.updatingByProject[projectId] ?? {}) }
      if (updating) {
        projectMap[sourceId] = true
      } else {
        delete projectMap[sourceId]
      }
      return {
        updatingByProject: {
          ...state.updatingByProject,
          [projectId]: projectMap,
        },
      }
    })
  },
  isProjectUpdating: (projectId) => {
    const map = get().updatingByProject[projectId]
    return !!map && Object.keys(map).length > 0
  },
}))

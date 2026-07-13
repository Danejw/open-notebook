import { create } from 'zustand'

interface KnowledgeExtractState {
  pendingSourceIds: Record<string, true>
  markPending: (sourceId: string) => void
  clearPending: (sourceId: string) => void
  isPending: (sourceId: string) => boolean
}

export const useKnowledgeExtractStore = create<KnowledgeExtractState>((set, get) => ({
  pendingSourceIds: {},
  markPending: (sourceId) =>
    set((state) => ({
      pendingSourceIds: { ...state.pendingSourceIds, [sourceId]: true },
    })),
  clearPending: (sourceId) =>
    set((state) => {
      const next = { ...state.pendingSourceIds }
      delete next[sourceId]
      return { pendingSourceIds: next }
    }),
  isPending: (sourceId) => Boolean(get().pendingSourceIds[sourceId]),
}))

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ProjectColumnsState {
  sourcesCollapsed: boolean
  artifactsCollapsed: boolean
  chatCollapsed: boolean
  toggleSources: () => void
  toggleArtifacts: () => void
  toggleNotes: () => void
  toggleChat: () => void
  setSources: (collapsed: boolean) => void
  setArtifacts: (collapsed: boolean) => void
  setNotes: (collapsed: boolean) => void
  setChat: (collapsed: boolean) => void
}

type PersistedProjectColumnsState = {
  sourcesCollapsed?: boolean
  artifactsCollapsed?: boolean
  notesCollapsed?: boolean
  chatCollapsed?: boolean
}

export const useProjectColumnsStore = create<ProjectColumnsState>()(
  persist(
    (set) => ({
      sourcesCollapsed: false,
      artifactsCollapsed: false,
      chatCollapsed: false,
      toggleSources: () => set((state) => ({ sourcesCollapsed: !state.sourcesCollapsed })),
      toggleArtifacts: () => set((state) => ({ artifactsCollapsed: !state.artifactsCollapsed })),
      toggleNotes: () => set((state) => ({ artifactsCollapsed: !state.artifactsCollapsed })),
      toggleChat: () => set((state) => ({ chatCollapsed: !state.chatCollapsed })),
      setSources: (collapsed) => set({ sourcesCollapsed: collapsed }),
      setArtifacts: (collapsed) => set({ artifactsCollapsed: collapsed }),
      setNotes: (collapsed) => set({ artifactsCollapsed: collapsed }),
      setChat: (collapsed) => set({ chatCollapsed: collapsed }),
    }),
    {
      name: 'project-columns-storage',
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as PersistedProjectColumnsState | undefined
        if (state && state.notesCollapsed !== undefined && state.artifactsCollapsed === undefined) {
          return {
            ...state,
            artifactsCollapsed: state.notesCollapsed,
          }
        }
        return persistedState
      },
      partialize: (state) => ({
        sourcesCollapsed: state.sourcesCollapsed,
        artifactsCollapsed: state.artifactsCollapsed,
        chatCollapsed: state.chatCollapsed,
      }),
    }
  )
)

/** @deprecated Use artifactsCollapsed from useProjectColumnsStore */
export function selectNotesCollapsed(state: ProjectColumnsState): boolean {
  return state.artifactsCollapsed
}

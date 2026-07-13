import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ProjectColumnsState {
  sourcesCollapsed: boolean
  notesCollapsed: boolean
  chatCollapsed: boolean
  toggleSources: () => void
  toggleNotes: () => void
  toggleChat: () => void
  setSources: (collapsed: boolean) => void
  setNotes: (collapsed: boolean) => void
  setChat: (collapsed: boolean) => void
}

export const useProjectColumnsStore = create<ProjectColumnsState>()(
  persist(
    (set) => ({
      sourcesCollapsed: false,
      notesCollapsed: false,
      chatCollapsed: false,
      toggleSources: () => set((state) => ({ sourcesCollapsed: !state.sourcesCollapsed })),
      toggleNotes: () => set((state) => ({ notesCollapsed: !state.notesCollapsed })),
      toggleChat: () => set((state) => ({ chatCollapsed: !state.chatCollapsed })),
      setSources: (collapsed) => set({ sourcesCollapsed: collapsed }),
      setNotes: (collapsed) => set({ notesCollapsed: collapsed }),
      setChat: (collapsed) => set({ chatCollapsed: collapsed }),
    }),
    {
      name: 'project-columns-storage',
    }
  )
)

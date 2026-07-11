import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ProjectViewMode = 'tile' | 'list'

interface ProjectViewState {
  viewMode: ProjectViewMode
  setViewMode: (mode: ProjectViewMode) => void
}

export const useProjectViewStore = create<ProjectViewState>()(
  persist(
    (set) => ({
      viewMode: 'tile',
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'project-view-storage',
    }
  )
)

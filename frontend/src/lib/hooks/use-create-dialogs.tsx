'use client'

import dynamic from 'next/dynamic'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

const AddSourceDialog = dynamic(
  () => import('@/components/sources/AddSourceDialog').then((m) => m.AddSourceDialog),
  { ssr: false, loading: () => null }
)

const CreateProjectDialog = dynamic(
  () => import('@/components/projects/CreateProjectDialog').then((m) => m.CreateProjectDialog),
  { ssr: false, loading: () => null }
)

const GeneratePodcastDialog = dynamic(
  () => import('@/components/podcasts/GeneratePodcastDialog').then((m) => m.GeneratePodcastDialog),
  { ssr: false, loading: () => null }
)

interface CreateDialogsContextType {
  openSourceDialog: () => void
  openProjectDialog: () => void
  openPodcastDialog: () => void
}

const CreateDialogsContext = createContext<CreateDialogsContextType | null>(null)

export function CreateDialogsProvider({ children }: { children: ReactNode }) {
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [podcastDialogOpen, setPodcastDialogOpen] = useState(false)

  const openSourceDialog = useCallback(() => setSourceDialogOpen(true), [])
  const openProjectDialog = useCallback(() => setProjectDialogOpen(true), [])
  const openPodcastDialog = useCallback(() => setPodcastDialogOpen(true), [])

  return (
    <CreateDialogsContext.Provider
      value={{
        openSourceDialog,
        openProjectDialog,
        openPodcastDialog,
      }}
    >
      {children}
      {sourceDialogOpen ? (
        <AddSourceDialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen} />
      ) : null}
      {projectDialogOpen ? (
        <CreateProjectDialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen} />
      ) : null}
      {podcastDialogOpen ? (
        <GeneratePodcastDialog open={podcastDialogOpen} onOpenChange={setPodcastDialogOpen} />
      ) : null}
    </CreateDialogsContext.Provider>
  )
}

export function useCreateDialogs() {
  const context = useContext(CreateDialogsContext)
  if (!context) {
    throw new Error('useCreateDialogs must be used within a CreateDialogsProvider')
  }
  return context
}

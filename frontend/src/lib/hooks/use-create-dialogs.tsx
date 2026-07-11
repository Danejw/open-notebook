'use client'

import dynamic from 'next/dynamic'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

const AddSourceDialog = dynamic(
  () => import('@/components/sources/AddSourceDialog').then((m) => m.AddSourceDialog),
  { ssr: false, loading: () => null }
)

const CreateNotebookDialog = dynamic(
  () => import('@/components/notebooks/CreateNotebookDialog').then((m) => m.CreateNotebookDialog),
  { ssr: false, loading: () => null }
)

const GeneratePodcastDialog = dynamic(
  () => import('@/components/podcasts/GeneratePodcastDialog').then((m) => m.GeneratePodcastDialog),
  { ssr: false, loading: () => null }
)

interface CreateDialogsContextType {
  openSourceDialog: () => void
  openNotebookDialog: () => void
  openPodcastDialog: () => void
}

const CreateDialogsContext = createContext<CreateDialogsContextType | null>(null)

export function CreateDialogsProvider({ children }: { children: ReactNode }) {
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false)
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false)
  const [podcastDialogOpen, setPodcastDialogOpen] = useState(false)

  const openSourceDialog = useCallback(() => setSourceDialogOpen(true), [])
  const openNotebookDialog = useCallback(() => setNotebookDialogOpen(true), [])
  const openPodcastDialog = useCallback(() => setPodcastDialogOpen(true), [])

  return (
    <CreateDialogsContext.Provider
      value={{
        openSourceDialog,
        openNotebookDialog,
        openPodcastDialog,
      }}
    >
      {children}
      {sourceDialogOpen ? (
        <AddSourceDialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen} />
      ) : null}
      {notebookDialogOpen ? (
        <CreateNotebookDialog open={notebookDialogOpen} onOpenChange={setNotebookDialogOpen} />
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

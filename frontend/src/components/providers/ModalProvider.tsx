'use client'

import dynamic from 'next/dynamic'
import { isArtifactModalType, useModalManager } from '@/lib/hooks/use-modal-manager'
import { SourceDialog } from '@/components/source/SourceDialog'

const ProjectNoteEditorDialog = dynamic(
  () =>
    import('@/app/(dashboard)/projects/components/ProjectNoteEditorDialog').then((m) => ({
      default: m.ProjectNoteEditorDialog,
    })),
  {
    ssr: false,
    loading: () => null,
  }
)

/**
 * Modal Provider Component
 *
 * Renders modals based on URL query parameters (?modal=type&id=xxx)
 * Manages modal state through the useModalManager hook
 *
 * Supported modal types:
 * - source: Source detail modal
 * - note | artifact: Project artifact editor modal
 */
export function ModalProvider() {
  const { modalType, modalId, closeModal } = useModalManager()

  return (
    <>
      <SourceDialog
        open={modalType === 'source'}
        onOpenChange={(open) => {
          if (!open) closeModal()
        }}
        sourceId={modalId}
      />

      {isArtifactModalType(modalType) && modalId ? (
        <ProjectNoteEditorDialog
          open
          onOpenChange={(open) => {
            if (!open) closeModal()
          }}
          projectId=""
          note={{ id: modalId, title: null, content: null }}
        />
      ) : null}
    </>
  )
}

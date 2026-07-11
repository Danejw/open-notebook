'use client'

import dynamic from 'next/dynamic'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { SourceDialog } from '@/components/source/SourceDialog'

const NoteEditorDialog = dynamic(
  () =>
    import('@/app/(dashboard)/notebooks/components/NoteEditorDialog').then((m) => ({
      default: m.NoteEditorDialog,
    })),
  {
    ssr: false,
    loading: () => null,
  }
)

const SourceInsightDialog = dynamic(
  () =>
    import('@/components/source/SourceInsightDialog').then((m) => ({
      default: m.SourceInsightDialog,
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
 * - note: Note editor modal
 * - insight: Source insight modal
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

      {modalType === 'note' && modalId ? (
        <NoteEditorDialog
          open
          onOpenChange={(open) => {
            if (!open) closeModal()
          }}
          notebookId=""
          note={{ id: modalId, title: null, content: null }}
        />
      ) : null}

      {modalType === 'insight' && modalId ? (
        <SourceInsightDialog
          open
          onOpenChange={(open) => {
            if (!open) closeModal()
          }}
          insight={{ id: modalId, insight_type: '', content: '' }}
        />
      ) : null}
    </>
  )
}

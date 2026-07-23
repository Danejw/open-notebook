'use client'

import { DetailPageSkeleton } from '@/components/common/LoadingSkeletons'
import { DocumentWorkspaceDialogs } from '@/app/(dashboard)/documents/[id]/components/DocumentWorkspaceDialogs'
import { DocumentWorkspaceView } from '@/app/(dashboard)/documents/[id]/components/DocumentWorkspaceView'
import { useDocumentWorkspace } from '@/app/(dashboard)/documents/[id]/hooks/useDocumentWorkspace'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function DocumentWorkspacePage() {
  const { t } = useTranslation()
  const workspace = useDocumentWorkspace()

  if (workspace.isLoading) {
    return <DetailPageSkeleton />
  }

  if (!workspace.document) {
    return (
      <div className="p-6 py-8">
        <p className="text-sm text-muted-foreground">{t('common.error')}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DocumentWorkspaceView
        document={workspace.document}
        documentId={workspace.documentId}
        codeDraft={workspace.codeDraft}
        setCodeDraft={workspace.setCodeDraft}
        activeTab={workspace.activeTab}
        setActiveTab={workspace.setActiveTab}
        spans={workspace.spans}
        iframeRef={workspace.iframeRef}
        setSaveDialogOpen={workspace.setSaveDialogOpen}
        setDuplicateOpen={workspace.setDuplicateOpen}
        setRenameOpen={workspace.setRenameOpen}
        setRenameTitle={workspace.setRenameTitle}
        setScenarioLabel={workspace.setScenarioLabel}
        setImagePickerOpen={workspace.setImagePickerOpen}
        setReplaceImgIndex={workspace.setReplaceImgIndex}
        setReplaceSlug={workspace.setReplaceSlug}
        setDeleteOpen={workspace.setDeleteOpen}
        exportPdf={workspace.exportPdf}
        deleteDocument={workspace.deleteDocument}
        handleAmountChange={workspace.handleAmountChange}
      />
      <DocumentWorkspaceDialogs
        document={workspace.document}
        saveDialogOpen={workspace.saveDialogOpen}
        setSaveDialogOpen={workspace.setSaveDialogOpen}
        duplicateOpen={workspace.duplicateOpen}
        setDuplicateOpen={workspace.setDuplicateOpen}
        renameOpen={workspace.renameOpen}
        setRenameOpen={workspace.setRenameOpen}
        renameTitle={workspace.renameTitle}
        setRenameTitle={workspace.setRenameTitle}
        scenarioLabel={workspace.scenarioLabel}
        setScenarioLabel={workspace.setScenarioLabel}
        imagePickerOpen={workspace.imagePickerOpen}
        setImagePickerOpen={workspace.setImagePickerOpen}
        replaceImgIndex={workspace.replaceImgIndex}
        setReplaceImgIndex={workspace.setReplaceImgIndex}
        replaceSlug={workspace.replaceSlug}
        setReplaceSlug={workspace.setReplaceSlug}
        deleteOpen={workspace.deleteOpen}
        setDeleteOpen={workspace.setDeleteOpen}
        updateDocument={workspace.updateDocument}
        duplicateDocument={workspace.duplicateDocument}
        deleteDocument={workspace.deleteDocument}
        handleSelectImage={workspace.handleSelectImage}
        handleSaveToDocument={workspace.handleSaveToDocument}
        handleUpdateTemplate={workspace.handleUpdateTemplate}
        handleDuplicate={workspace.handleDuplicate}
        handleRename={workspace.handleRename}
        handleDelete={workspace.handleDelete}
      />
    </div>
  )
}

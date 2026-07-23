'use client'

import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { RenameFieldDialog } from '@/components/common/RenameFieldDialog'
import { ImageLibraryPicker } from '@/components/media/ImageLibraryPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { DocumentWorkspace } from '@/app/(dashboard)/documents/[id]/hooks/useDocumentWorkspace'

type DocumentWorkspaceDialogsProps = Pick<
  DocumentWorkspace,
  | 'document'
  | 'saveDialogOpen'
  | 'setSaveDialogOpen'
  | 'duplicateOpen'
  | 'setDuplicateOpen'
  | 'renameOpen'
  | 'setRenameOpen'
  | 'renameTitle'
  | 'setRenameTitle'
  | 'scenarioLabel'
  | 'setScenarioLabel'
  | 'imagePickerOpen'
  | 'setImagePickerOpen'
  | 'replaceImgIndex'
  | 'setReplaceImgIndex'
  | 'replaceSlug'
  | 'setReplaceSlug'
  | 'deleteOpen'
  | 'setDeleteOpen'
  | 'updateDocument'
  | 'duplicateDocument'
  | 'deleteDocument'
  | 'handleSelectImage'
  | 'handleSaveToDocument'
  | 'handleUpdateTemplate'
  | 'handleDuplicate'
  | 'handleRename'
  | 'handleDelete'
>

export function DocumentWorkspaceDialogs(props: DocumentWorkspaceDialogsProps) {
  const { t } = useTranslation()
  const document = props.document
  if (!document) return null

  return (
    <>
      <Dialog open={props.saveDialogOpen} onOpenChange={props.setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documents.saveCodeTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('documents.saveCodeDesc')}
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => void props.handleSaveToDocument()}>
              {t('documents.saveToDocument')}
            </Button>
            <Button
              variant="secondary"
              disabled={!document.template_id}
              onClick={() => void props.handleUpdateTemplate()}
            >
              {t('documents.updateTemplate')}
            </Button>
            <Button
              variant="outline"
              onClick={() => props.setSaveDialogOpen(false)}
            >
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.duplicateOpen} onOpenChange={props.setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documents.duplicate')}</DialogTitle>
          </DialogHeader>
          <Input
            value={props.scenarioLabel}
            onChange={(e) => props.setScenarioLabel(e.target.value)}
            placeholder={t('documents.scenarioPlaceholder')}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => props.setDuplicateOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              disabled={
                !props.scenarioLabel.trim() || props.duplicateDocument.isPending
              }
              onClick={() => void props.handleDuplicate()}
            >
              {t('documents.createScenario')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RenameFieldDialog
        open={props.renameOpen}
        onOpenChange={props.setRenameOpen}
        title={t('documents.renameDocument')}
        label={t('common.title')}
        value={props.renameTitle}
        onChange={props.setRenameTitle}
        isSubmitting={props.updateDocument.isPending}
        contentClassName="sm:max-w-md"
        formClassName="space-y-4"
        fieldClassName="space-y-2"
        inputId="document-rename-title"
        onSubmit={(event) => {
          event.preventDefault()
          void props.handleRename()
        }}
      />

      <ImageLibraryPicker
        open={props.imagePickerOpen}
        onOpenChange={(open) => {
          props.setImagePickerOpen(open)
          if (!open) {
            props.setReplaceImgIndex(null)
            props.setReplaceSlug(null)
          }
        }}
        onSelect={props.handleSelectImage}
        title={
          props.replaceImgIndex != null || props.replaceSlug
            ? t('documents.replaceImage')
            : t('documents.insertImage')
        }
      />

      <ConfirmDialog
        open={props.deleteOpen}
        onOpenChange={props.setDeleteOpen}
        title={t('common.delete')}
        description={t('documents.confirmDeleteDocument')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={props.deleteDocument.isPending}
        onConfirm={() => void props.handleDelete()}
      />
    </>
  )
}

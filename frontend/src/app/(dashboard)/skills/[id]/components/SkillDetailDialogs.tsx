'use client'

import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { RenameFieldDialog } from '@/components/common/RenameFieldDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { SkillDetailPageState } from '@/app/(dashboard)/skills/[id]/hooks/useSkillDetailPage'

type SkillDetailDialogsProps = Pick<
  SkillDetailPageState,
  | 'newFileId'
  | 'renameFileId'
  | 'createFileOpen'
  | 'setCreateFileOpen'
  | 'newFilePath'
  | 'setNewFilePath'
  | 'renameFrom'
  | 'setRenameFrom'
  | 'renameTo'
  | 'setRenameTo'
  | 'showUnsavedDialog'
  | 'setShowUnsavedDialog'
  | 'setPendingFilePath'
  | 'showDeleteSkill'
  | 'setShowDeleteSkill'
  | 'deleteFilePath'
  | 'setDeleteFilePath'
  | 'upsertFile'
  | 'moveFile'
  | 'deleteSkill'
  | 'deleteFile'
  | 'handleCreateFile'
  | 'handleRenameFile'
  | 'handleDiscardUnsaved'
  | 'handleDeleteSkill'
  | 'handleDeleteFile'
>

export function SkillDetailDialogs(props: SkillDetailDialogsProps) {
  const { t } = useTranslation()

  return (
    <>
      <FormDialogShell
        open={props.createFileOpen}
        onOpenChange={props.setCreateFileOpen}
        title={t('skills.newFile')}
        description={t('skills.newFileDesc')}
        submitLabel={t('skills.createFile')}
        isSubmitting={props.upsertFile.isPending}
        disableSubmit={!props.newFilePath.trim()}
        onSubmit={(event) => {
          event.preventDefault()
          void props.handleCreateFile()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={props.newFileId}>{t('skills.filePath')}</Label>
          <Input
            id={props.newFileId}
            value={props.newFilePath}
            onChange={(e) => props.setNewFilePath(e.target.value)}
            placeholder="references/example.md"
          />
        </div>
      </FormDialogShell>

      <RenameFieldDialog
        open={!!props.renameFrom}
        onOpenChange={(open) => {
          if (!open) props.setRenameFrom(null)
        }}
        title={t('skills.renameFile')}
        description={t('skills.renameFileDesc')}
        submitLabel={t('skills.renameFile')}
        label={t('skills.filePath')}
        value={props.renameTo}
        onChange={props.setRenameTo}
        isSubmitting={props.moveFile.isPending}
        inputId={props.renameFileId}
        fieldClassName="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          void props.handleRenameFile()
        }}
      />

      <ConfirmDialog
        open={props.showUnsavedDialog}
        onOpenChange={(open) => {
          props.setShowUnsavedDialog(open)
          if (!open) {
            props.setPendingFilePath(null)
          }
        }}
        title={t('skills.unsavedChanges')}
        description={t('skills.unsavedWarning')}
        confirmText={t('common.confirm')}
        onConfirm={props.handleDiscardUnsaved}
      />

      <ConfirmDialog
        open={props.showDeleteSkill}
        onOpenChange={props.setShowDeleteSkill}
        title={t('skills.delete')}
        description={t('skills.deleteConfirm')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => void props.handleDeleteSkill()}
        isLoading={props.deleteSkill.isPending}
      />

      <ConfirmDialog
        open={!!props.deleteFilePath}
        onOpenChange={(open) => !open && props.setDeleteFilePath(null)}
        title={t('skills.deleteFile')}
        description={t('skills.deleteFileConfirm').replace(
          '{path}',
          props.deleteFilePath || ''
        )}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => void props.handleDeleteFile()}
        isLoading={props.deleteFile.isPending}
      />
    </>
  )
}

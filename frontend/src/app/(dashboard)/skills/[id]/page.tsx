'use client'

import Link from 'next/link'
import { SkillDetailDialogs } from '@/app/(dashboard)/skills/[id]/components/SkillDetailDialogs'
import { SkillDetailHeader } from '@/app/(dashboard)/skills/[id]/components/SkillDetailHeader'
import { SkillMetadataSection } from '@/app/(dashboard)/skills/[id]/components/SkillMetadataSection'
import { useSkillDetailPage } from '@/app/(dashboard)/skills/[id]/hooks/useSkillDetailPage'
import { SkillFileTree } from '@/app/(dashboard)/skills/components/SkillFileTree'
import { SkillEditorPanel } from '@/app/(dashboard)/skills/components/SkillEditorPanel'
import { PageError } from '@/components/common/PageError'
import { DetailPageSkeleton } from '@/components/common/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function SkillDetailPage() {
  const { t } = useTranslation()
  const page = useSkillDetailPage()

  if (page.isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <DetailPageSkeleton />
      </div>
    )
  }

  if (!page.skill) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <PageError
          title={t('skills.notFound')}
          tone="muted"
          centered
          action={
            <Button asChild variant="outline">
              <Link href="/skills">{t('skills.backToList')}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-6xl">
          <SkillDetailHeader
            skill={page.skill}
            dirty={page.dirty}
            metadataDirty={page.metadataDirty}
            validateSkill={page.validateSkill}
            exportSkill={page.exportSkill}
            archiveSkill={page.archiveSkill}
            handleValidate={page.handleValidate}
            handleArchive={page.handleArchive}
            setShowDeleteSkill={page.setShowDeleteSkill}
          />

          <SkillMetadataSection
            nameId={page.nameId}
            descriptionId={page.descriptionId}
            tagsId={page.tagsId}
            name={page.name}
            setName={page.setName}
            description={page.description}
            setDescription={page.setDescription}
            tagsInput={page.tagsInput}
            setTagsInput={page.setTagsInput}
            metadataDirty={page.metadataDirty}
            setMetadataDirty={page.setMetadataDirty}
            updateSkill={page.updateSkill}
            validation={page.validation}
            handleSaveMetadata={page.handleSaveMetadata}
          />

          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <SkillFileTree
              files={page.skill.files}
              selectedPath={page.selectedPath}
              onSelect={page.selectFile}
              onCreate={() => page.setCreateFileOpen(true)}
              onRename={(path) => {
                page.setRenameFrom(path)
                page.setRenameTo(path)
              }}
              onDelete={(path) => page.setDeleteFilePath(path)}
            />
            <SkillEditorPanel
              path={page.selectedPath}
              content={page.editorContent}
              dirty={page.dirty}
              saving={page.upsertFile.isPending}
              onChange={(value) => {
                page.setEditorContent(value)
                page.setDirty(true)
              }}
              onSave={page.handleSaveFile}
            />
          </div>
        </div>
      </div>

      <SkillDetailDialogs
        newFileId={page.newFileId}
        renameFileId={page.renameFileId}
        createFileOpen={page.createFileOpen}
        setCreateFileOpen={page.setCreateFileOpen}
        newFilePath={page.newFilePath}
        setNewFilePath={page.setNewFilePath}
        renameFrom={page.renameFrom}
        setRenameFrom={page.setRenameFrom}
        renameTo={page.renameTo}
        setRenameTo={page.setRenameTo}
        showUnsavedDialog={page.showUnsavedDialog}
        setShowUnsavedDialog={page.setShowUnsavedDialog}
        setPendingFilePath={page.setPendingFilePath}
        showDeleteSkill={page.showDeleteSkill}
        setShowDeleteSkill={page.setShowDeleteSkill}
        deleteFilePath={page.deleteFilePath}
        setDeleteFilePath={page.setDeleteFilePath}
        upsertFile={page.upsertFile}
        moveFile={page.moveFile}
        deleteSkill={page.deleteSkill}
        deleteFile={page.deleteFile}
        handleCreateFile={page.handleCreateFile}
        handleRenameFile={page.handleRenameFile}
        handleDiscardUnsaved={page.handleDiscardUnsaved}
        handleDeleteSkill={page.handleDeleteSkill}
        handleDeleteFile={page.handleDeleteFile}
      />
    </>
  )
}

'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Archive,
  ArrowLeft,
  Download,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { RenameFieldDialog } from '@/components/common/RenameFieldDialog'
import { PageError } from '@/components/common/PageError'
import { DetailPageSkeleton } from '@/components/common/LoadingSkeletons'
import { SkillFileTree } from '../components/SkillFileTree'
import { SkillEditorPanel } from '../components/SkillEditorPanel'
import {
  useArchiveSkill,
  useDeleteSkill,
  useDeleteSkillFile,
  useExportSkill,
  useMoveSkillFile,
  useSkill,
  useUpdateSkill,
  useUpsertSkillFile,
  useValidateSkill,
} from '@/lib/hooks/use-skills'
import { useTranslation } from '@/lib/hooks/use-translation'
import { ValidationResult } from '@/lib/types/skills'

export default function SkillDetailPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const skillId = params.id

  const { data: skill, isLoading } = useSkill(skillId)
  const updateSkill = useUpdateSkill()
  const deleteSkill = useDeleteSkill()
  const archiveSkill = useArchiveSkill()
  const upsertFile = useUpsertSkillFile()
  const moveFile = useMoveSkillFile()
  const deleteFile = useDeleteSkillFile()
  const validateSkill = useValidateSkill()
  const exportSkill = useExportSkill()

  const nameId = useId()
  const descriptionId = useId()
  const tagsId = useId()
  const newFileId = useId()
  const renameFileId = useId()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [showDeleteSkill, setShowDeleteSkill] = useState(false)
  const [deleteFilePath, setDeleteFilePath] = useState<string | null>(null)
  const [createFileOpen, setCreateFileOpen] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [renameFrom, setRenameFrom] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  useEffect(() => {
    if (!skill) return
    setName(skill.name)
    setDescription(skill.description || '')
    setTagsInput(skill.tags.join(', '))
    setMetadataDirty(false)
    setValidation(
      skill.validation_results && typeof skill.validation_results === 'object'
        ? (skill.validation_results as unknown as ValidationResult)
        : null
    )
  }, [skill])

  useEffect(() => {
    if (!skill || selectedPath) return
    if (skill.files.length === 0) return
    const skillMd = skill.files.find((file) => file.path === 'SKILL.md')
    setSelectedPath(skillMd?.path ?? skill.files[0].path)
  }, [skill, selectedPath])

  const selectedFile = useMemo(
    () => skill?.files.find((file) => file.path === selectedPath) ?? null,
    [skill, selectedPath]
  )

  useEffect(() => {
    if (!selectedFile) {
      setEditorContent('')
      setDirty(false)
      return
    }
    setEditorContent(selectedFile.content)
    setDirty(false)
  }, [selectedFile?.path, selectedFile?.content])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || metadataDirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty, metadataDirty])

  const selectFile = useCallback(
    (path: string) => {
      if (path === selectedPath) return
      if (dirty) {
        setPendingFilePath(path)
        setShowUnsavedDialog(true)
        return
      }
      setSelectedPath(path)
    },
    [dirty, selectedPath]
  )

  const handleDiscardUnsaved = () => {
    if (pendingFilePath !== null) {
      setSelectedPath(pendingFilePath)
      setPendingFilePath(null)
    }
    setShowUnsavedDialog(false)
  }

  const handleSaveMetadata = async () => {
    if (!skill) return
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    await updateSkill.mutateAsync({
      id: skill.id,
      data: {
        name: name.trim(),
        description: description.trim(),
        tags,
      },
    })
    setMetadataDirty(false)
  }

  const handleSaveFile = async () => {
    if (!skill || !selectedPath) return
    await upsertFile.mutateAsync({
      id: skill.id,
      data: {
        path: selectedPath,
        content: editorContent,
        encoding: selectedFile?.encoding || 'utf-8',
        mime_type: selectedFile?.mime_type,
      },
    })
    setDirty(false)
  }

  const handleCreateFile = async () => {
    if (!skill || !newFilePath.trim()) return
    const path = newFilePath.trim().replace(/^\/+/, '')
    await upsertFile.mutateAsync({
      id: skill.id,
      data: {
        path,
        content: '',
        encoding: 'utf-8',
        mime_type: path.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain',
      },
    })
    setCreateFileOpen(false)
    setNewFilePath('')
    setSelectedPath(path)
  }

  const handleRenameFile = async () => {
    if (!skill || !renameFrom || !renameTo.trim()) return
    const toPath = renameTo.trim().replace(/^\/+/, '')
    await moveFile.mutateAsync({
      id: skill.id,
      data: { from_path: renameFrom, to_path: toPath },
    })
    setRenameFrom(null)
    setRenameTo('')
    setSelectedPath(toPath)
    setDirty(false)
  }

  const handleDeleteFile = async () => {
    if (!skill || !deleteFilePath) return
    await deleteFile.mutateAsync({ id: skill.id, path: deleteFilePath })
    if (selectedPath === deleteFilePath) {
      setSelectedPath(null)
    }
    setDeleteFilePath(null)
  }

  const handleValidate = async () => {
    if (!skill) return
    const result = await validateSkill.mutateAsync(skill.id)
    setValidation(result)
  }

  const handleArchive = async () => {
    if (!skill) return
    await archiveSkill.mutateAsync({ id: skill.id, archived: !skill.archived })
  }

  const handleDeleteSkill = async () => {
    if (!skill) return
    await deleteSkill.mutateAsync(skill.id)
    setShowDeleteSkill(false)
    router.push('/skills')
  }

  if (isLoading) {
    return (
              <div className="flex-1 overflow-y-auto">
          <DetailPageSkeleton />
        </div>
    )
  }

  if (!skill) {
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
          <PageHeader
            leading={
              <Button asChild variant="ghost" size="sm" className="-ml-1 mb-1 h-7 px-2 text-xs">
                <Link href="/skills">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  {t('skills.backToList')}
                </Link>
              </Button>
            }
            title={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {skill.name}
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                  {skill.status}
                </Badge>
                {skill.archived ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                    {t('skills.archived')}
                  </Badge>
                ) : null}
              </span>
            }
            description={
              dirty || metadataDirty ? (
                <span className="text-amber-600 dark:text-amber-400">{t('skills.unsavedChanges')}</span>
              ) : undefined
            }
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleValidate}
                  disabled={validateSkill.isPending}
                >
                  <ShieldCheck className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('skills.validate')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => exportSkill.mutate(skill.id)}
                  disabled={exportSkill.isPending}
                >
                  <Download className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('skills.export')}</span>
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleArchive} disabled={archiveSkill.isPending}>
                  <Archive className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{skill.archived ? t('skills.unarchive') : t('skills.archive')}</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowDeleteSkill(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('common.delete')}</span>
                </Button>
              </>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('skills.metadata')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={nameId}>{t('common.name')}</Label>
                  <Input
                    id={nameId}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setMetadataDirty(true)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={tagsId}>{t('skills.tags')}</Label>
                  <Input
                    id={tagsId}
                    value={tagsInput}
                    onChange={(e) => {
                      setTagsInput(e.target.value)
                      setMetadataDirty(true)
                    }}
                    placeholder={t('skills.tagsPlaceholder')}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={descriptionId}>{t('common.description')}</Label>
                <Textarea
                  id={descriptionId}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setMetadataDirty(true)
                  }}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleSaveMetadata}
                disabled={!metadataDirty || updateSkill.isPending}
              >
                {updateSkill.isPending ? t('common.saving') : t('skills.saveMetadata')}
              </Button>
            </CardContent>
          </Card>

          {validation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {validation.valid ? t('skills.validationPassed') : t('skills.validationFailed')}
                </CardTitle>
              </CardHeader>
              {!validation.valid && validation.issues.length > 0 && (
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {validation.issues.map((issue, index) => (
                      <li key={`${issue.message}-${index}`} className="rounded-md border p-2">
                        <p className="font-medium">
                          [{issue.severity}] {issue.message}
                        </p>
                        {issue.path && (
                          <p className="text-xs text-muted-foreground font-mono">{issue.path}</p>
                        )}
                        {issue.fix && (
                          <p className="text-xs text-muted-foreground mt-1">{issue.fix}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <SkillFileTree
              files={skill.files}
              selectedPath={selectedPath}
              onSelect={selectFile}
              onCreate={() => setCreateFileOpen(true)}
              onRename={(path) => {
                setRenameFrom(path)
                setRenameTo(path)
              }}
              onDelete={(path) => setDeleteFilePath(path)}
            />
            <SkillEditorPanel
              path={selectedPath}
              content={editorContent}
              dirty={dirty}
              saving={upsertFile.isPending}
              onChange={(value) => {
                setEditorContent(value)
                setDirty(true)
              }}
              onSave={handleSaveFile}
            />
          </div>
        </div>
      </div>

      <FormDialogShell
        open={createFileOpen}
        onOpenChange={setCreateFileOpen}
        title={t('skills.newFile')}
        description={t('skills.newFileDesc')}
        submitLabel={t('skills.createFile')}
        isSubmitting={upsertFile.isPending}
        disableSubmit={!newFilePath.trim()}
        onSubmit={(event) => {
          event.preventDefault()
          void handleCreateFile()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={newFileId}>{t('skills.filePath')}</Label>
          <Input
            id={newFileId}
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            placeholder="references/example.md"
          />
        </div>
      </FormDialogShell>

      <RenameFieldDialog
        open={!!renameFrom}
        onOpenChange={(open) => {
          if (!open) setRenameFrom(null)
        }}
        title={t('skills.renameFile')}
        description={t('skills.renameFileDesc')}
        submitLabel={t('skills.renameFile')}
        label={t('skills.filePath')}
        value={renameTo}
        onChange={setRenameTo}
        isSubmitting={moveFile.isPending}
        inputId={renameFileId}
        fieldClassName="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          void handleRenameFile()
        }}
      />

      <ConfirmDialog
        open={showUnsavedDialog}
        onOpenChange={(open) => {
          setShowUnsavedDialog(open)
          if (!open) {
            setPendingFilePath(null)
          }
        }}
        title={t('skills.unsavedChanges')}
        description={t('skills.unsavedWarning')}
        confirmText={t('common.confirm')}
        onConfirm={handleDiscardUnsaved}
      />

      <ConfirmDialog
        open={showDeleteSkill}
        onOpenChange={setShowDeleteSkill}
        title={t('skills.delete')}
        description={t('skills.deleteConfirm')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={handleDeleteSkill}
        isLoading={deleteSkill.isPending}
      />

      <ConfirmDialog
        open={!!deleteFilePath}
        onOpenChange={(open) => !open && setDeleteFilePath(null)}
        title={t('skills.deleteFile')}
        description={t('skills.deleteFileConfirm').replace('{path}', deleteFilePath || '')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={handleDeleteFile}
        isLoading={deleteFile.isPending}
      />
    </>
  )
}

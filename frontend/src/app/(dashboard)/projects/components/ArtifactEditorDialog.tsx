'use client'

import { Controller, useForm, useWatch } from 'react-hook-form'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useCreateProjectArtifact,
  useUpdateProjectArtifact,
  useProjectArtifact,
} from '@/lib/hooks/use-project-artifacts'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { InlineEdit } from '@/components/common/InlineEdit'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'
import { FieldError } from '@/components/common/FieldError'
import { normalizeArtifactId } from '@/lib/utils/export-artifact'
import { MarkdownArtifactEditorShell } from '@/components/common/MarkdownArtifactEditorShell'

const createArtifactSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
})

type CreateArtifactFormData = z.infer<typeof createArtifactSchema>

interface ArtifactEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  note?: { id: string; title: string | null; content: string | null }
}

export function ArtifactEditorDialog({ open, onOpenChange, projectId, note }: ArtifactEditorDialogProps) {
  const { t } = useTranslation()
  const createArtifact = useCreateProjectArtifact()
  const updateArtifact = useUpdateProjectArtifact()
  const queryClient = useQueryClient()
  const isEditing = Boolean(note)

  const artifactIdWithPrefix = note?.id ? normalizeArtifactId(note.id) : ''

  const { data: fetchedArtifact, isLoading: artifactLoading } = useProjectArtifact(
    artifactIdWithPrefix,
    { enabled: open && !!note?.id }
  )
  const isSaving = isEditing ? updateArtifact.isPending : createArtifact.isPending
  const {
    handleSubmit,
    control,
    formState: { errors },
    reset,
    setValue,
  } = useForm<CreateArtifactFormData>({
    resolver: zodResolver(createArtifactSchema),
    defaultValues: {
      title: '',
      content: '',
    },
  })
  const watchTitle = useWatch({ control, name: 'title' })
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false)

  useEffect(() => {
    if (!open) {
      reset({ title: '', content: '' })
      return
    }

    const source = fetchedArtifact ?? note
    const title = source?.title ?? ''
    const content = source?.content ?? ''

    reset({ title, content })
  }, [open, note, fetchedArtifact, reset])

  useEffect(() => {
    if (!open) return

    const observer = new MutationObserver(() => {
      setIsEditorFullscreen(!!document.querySelector('.w-md-editor-fullscreen'))
    })
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [open])

  const onSubmit = async (data: CreateArtifactFormData) => {
    if (note) {
      await updateArtifact.mutateAsync({
        id: artifactIdWithPrefix,
        data: {
          title: data.title || undefined,
          content: data.content,
        },
      })
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projectArtifacts(projectId) })
      }
    } else {
      if (!projectId) {
        console.error('Cannot create artifact without project_id')
        return
      }
      await createArtifact.mutateAsync({
        title: data.title || undefined,
        content: data.content,
        artifact_kind: 'manual',
        project_id: projectId,
      })
    }
    reset()
    onOpenChange(false)
  }

  const handleClose = () => {
    reset()
    setIsEditorFullscreen(false)
    onOpenChange(false)
  }

  const showLoading = isEditing && artifactLoading

  return (
    <MarkdownArtifactEditorShell
      open={open}
      onOpenChange={onOpenChange}
      accessibilityTitle={isEditing ? t('sources.editNote') : t('sources.createNote')}
      header={
        showLoading ? undefined : (
          <InlineEdit
            id="artifact-title"
            name="title"
            value={watchTitle ?? ''}
            onSave={(value) => setValue('title', value || '')}
            placeholder={t('sources.addTitle')}
            emptyText={t('sources.untitledNote')}
            className="text-base font-semibold leading-snug"
            inputClassName="text-base font-semibold leading-snug"
          />
        )
      }
      onSave={handleSubmit(onSubmit)}
      onCancel={handleClose}
      isSaving={isSaving}
      disableSave={showLoading}
      isLoading={showLoading}
      loadingLabel={t('common.loading')}
      saveLabel={isEditing ? t('sources.saveNote') : t('sources.createNoteBtn')}
      savingLabel={
        isEditing ? `${t('common.saving')}...` : `${t('common.creating')}...`
      }
      contentClassName={
        isEditorFullscreen
          ? '!max-w-screen !max-h-screen !w-screen !h-screen border-none'
          : undefined
      }
    >
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-1 py-1',
          isEditorFullscreen && 'px-0 py-0'
        )}
      >
        <Controller
          control={control}
          name="content"
          render={({ field }) => (
            <MarkdownEditor
              key={note?.id ?? 'new'}
              textareaId="artifact-content"
              value={field.value}
              onChange={field.onChange}
              height={420}
              placeholder={t('sources.writeNotePlaceholder')}
              className={cn(
                'h-full min-h-[420px] w-full overflow-hidden [&_.w-md-editor]:!static [&_.w-md-editor]:!h-full [&_.w-md-editor]:!w-full [&_.w-md-editor-content]:overflow-y-auto',
                !isEditorFullscreen && 'rounded-md border'
              )}
            />
          )}
        />
        <FieldError message={errors.content?.message} />
      </div>
    </MarkdownArtifactEditorShell>
  )
}

/** @deprecated Use ArtifactEditorDialog */
export const NoteEditorDialog = ArtifactEditorDialog

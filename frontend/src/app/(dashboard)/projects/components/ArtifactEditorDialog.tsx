'use client'

import { Controller, useForm, useWatch } from 'react-hook-form'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, dialogLargeContentClassName } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  useCreateProjectArtifact,
  useUpdateProjectArtifact,
  useProjectArtifact,
} from '@/lib/hooks/use-project-artifacts'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { InlineEdit } from '@/components/common/InlineEdit'
import { cn } from "@/lib/utils";
import { useTranslation } from '@/lib/hooks/use-translation'
import { DialogBodyLoading } from '@/components/common/LoadingSkeletons'
import { FieldError } from '@/components/common/FieldError'
import { normalizeArtifactId } from '@/lib/utils/export-artifact'

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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          dialogLargeContentClassName,
          'overflow-hidden p-0',
          isEditorFullscreen && '!max-w-screen !max-h-screen !w-screen !h-screen border-none'
        )}
      >
        <DialogTitle className="sr-only">
          {isEditing ? t('sources.editNote') : t('sources.createNote')}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full min-w-0 flex-col">
          {isEditing && artifactLoading ? (
            <DialogBodyLoading label={t('common.loading')} />
          ) : (
            <>
              <DialogHeader className="border-b">
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
              </DialogHeader>

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
            </>
          )}

          <DialogFooter className="border-t">
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7"
              disabled={isSaving || (isEditing && artifactLoading)}
            >
              {isSaving
                ? isEditing ? `${t('common.saving')}...` : `${t('common.creating')}...`
                : isEditing
                  ? t('sources.saveNote')
                  : t('sources.createNoteBtn')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** @deprecated Use ArtifactEditorDialog */
export const NoteEditorDialog = ArtifactEditorDialog

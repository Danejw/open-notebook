'use client'

import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { useCreateArtifact, useUpdateArtifact, useArtifact } from '@/lib/hooks/use-artifacts'
import { Artifact } from '@/lib/types/artifacts'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useTranslation } from '@/lib/hooks/use-translation'

const artifactSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1),
  apply_default: z.boolean().optional(),
})

type ArtifactFormData = z.infer<typeof artifactSchema>

interface ArtifactEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  artifact?: Artifact
}

export function ArtifactEditorDialog({ open, onOpenChange, artifact }: ArtifactEditorDialogProps) {
  const { t } = useTranslation()
  const nameId = useId()
  const titleId = useId()
  const defaultId = useId()
  const descriptionId = useId()
  const promptId = useId()
  const isEditing = Boolean(artifact)
  const { data: fetchedArtifact, isLoading } = useArtifact(artifact?.id ?? '', {
    enabled: open && Boolean(artifact?.id),
  })
  const createArtifact = useCreateArtifact()
  const updateArtifact = useUpdateArtifact()
  const queryClient = useQueryClient()

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ArtifactFormData>({
    resolver: zodResolver(artifactSchema),
    defaultValues: {
      name: '',
      title: '',
      description: '',
      prompt: '',
      apply_default: false,
    },
  })

  useEffect(() => {
    if (!open) {
      reset({ name: '', title: '', description: '', prompt: '', apply_default: false })
      return
    }

    const source = fetchedArtifact ?? artifact
    reset({
      name: source?.name ?? '',
      title: source?.title ?? '',
      description: source?.description ?? '',
      prompt: source?.prompt ?? '',
      apply_default: source?.apply_default ?? false,
    })
  }, [open, artifact, fetchedArtifact, reset])

  const onSubmit = async (data: ArtifactFormData) => {
    if (artifact) {
      await updateArtifact.mutateAsync({
        id: artifact.id,
        data: {
          name: data.name,
          title: data.title || undefined,
          description: data.description || undefined,
          prompt: data.prompt,
          apply_default: Boolean(data.apply_default),
        },
      })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artifact(artifact.id) })
    } else {
      await createArtifact.mutateAsync({
        name: data.name,
        title: data.title || data.name,
        description: data.description || '',
        prompt: data.prompt,
        apply_default: Boolean(data.apply_default),
      })
    }

    reset()
    onOpenChange(false)
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  const isSaving = artifact ? updateArtifact.isPending : createArtifact.isPending

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">
          {isEditing ? t('common.edit') : t('artifacts.createNew')}
        </DialogTitle>
        <DialogDescription className="sr-only">
           {isEditing ? t('common.editArtifact') : t('artifacts.createNew')}
        </DialogDescription>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          {isEditing && isLoading ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
            </div>
          ) : (
            <>
              <div className="border-b px-6 py-4 space-y-4">
                <div>
                  <Label htmlFor={nameId} className="text-sm font-medium">
                    {t('artifacts.name')}
                  </Label>
                  <Controller
                    control={control}
                    name="name"
                    render={({ field }) => (
                        <Input
                        id={nameId}
                        {...field}
                        placeholder={t('artifacts.namePlaceholder')}
                        autoComplete="off"
                      />
                    )}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={titleId} className="text-sm font-medium">
                      {t('common.title')}
                    </Label>
                    <Controller
                      control={control}
                      name="title"
                      render={({ field }) => (
                        <Input
                           id={titleId}
                           {...field}
                           placeholder={t('artifacts.titlePlaceholder')}
                           autoComplete="off"
                         />
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6 md:pt-8">
                    <Controller
                      control={control}
                      name="apply_default"
                      render={({ field }) => (
                        <Checkbox
                          id={defaultId}
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                        />
                      )}
                    />
                     <Label htmlFor={defaultId} className="text-sm">
                       {t('artifacts.suggestDefault')}
                     </Label>
                  </div>
                </div>

                <div>
                   <Label htmlFor={descriptionId} className="text-sm font-medium">
                     {t('projects.addDescription').replace('...', '')}
                   </Label>
                  <Controller
                    control={control}
                    name="description"
                    render={({ field }) => (
                      <Textarea
                         id={descriptionId}
                         {...field}
                         placeholder={t('artifacts.descriptionPlaceholder')}
                         rows={2}
                         autoComplete="off"
                      />
                    )}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <Label htmlFor={promptId} className="text-sm font-medium">{t('artifacts.systemPrompt')}</Label>
                <Controller
                  control={control}
                  name="prompt"
                  render={({ field }) => (
                    <MarkdownEditor
                      key={artifact?.id ?? 'new-artifact'}
                      value={field.value}
                      onChange={field.onChange}
                      height={420}
                      placeholder={t('artifacts.promptPlaceholder')}
                      className="rounded-md border"
                      textareaId={promptId}
                      name={field.name}
                    />
                  )}
                />
                {errors.prompt && (
                  <p className="text-sm text-red-600 mt-1">{errors.prompt.message}</p>
                )}
                 <p className="text-xs text-muted-foreground mt-3">
                   {t('artifacts.promptHint')}
                 </p>
              </div>
            </>
          )}

          <div className="border-t px-6 py-4 flex justify-end gap-2">
             <Button type="button" variant="outline" onClick={handleClose}>
               {t('common.cancel')}
             </Button>
              <Button type="submit" disabled={isSaving || (isEditing && isLoading)}>
                {isSaving
                  ? isEditing ? `${t('common.saving')}...` : `${t('common.creating')}...`
                  : isEditing
                    ? t('common.editArtifact')
                    : t('artifacts.createNew')}
              </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DialogTitle, dialogBodyClassName } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { ChatDefaultsPickerRow } from '@/components/chat/ChatDefaultsPickerRow'
import { useCreateArtifact, useUpdateArtifact, useArtifact } from '@/lib/hooks/use-artifacts'
import { Artifact } from '@/lib/types/artifacts'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { FieldError } from '@/components/common/FieldError'
import { MarkdownArtifactEditorShell } from '@/components/common/MarkdownArtifactEditorShell'

const artifactSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1),
  apply_default: z.boolean().optional(),
  skill_ids: z.array(z.string()),
  collection_ids: z.array(z.string()),
  mcp_tool_ids: z.array(z.string()),
  html_template_id: z.string().nullable(),
})

type ArtifactFormData = z.infer<typeof artifactSchema>

const emptyFormValues: ArtifactFormData = {
  name: '',
  title: '',
  description: '',
  prompt: '',
  apply_default: false,
  skill_ids: [],
  collection_ids: [],
  mcp_tool_ids: [],
  html_template_id: null,
}

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
    defaultValues: emptyFormValues,
  })

  useEffect(() => {
    if (!open) {
      reset(emptyFormValues)
      return
    }

    const source = fetchedArtifact ?? artifact
    reset({
      name: source?.name ?? '',
      title: source?.title ?? '',
      description: source?.description ?? '',
      prompt: source?.prompt ?? '',
      apply_default: source?.apply_default ?? false,
      skill_ids: source?.skill_ids ?? [],
      collection_ids: source?.collection_ids ?? [],
      mcp_tool_ids: source?.mcp_tool_ids ?? [],
      html_template_id: source?.html_template_id ?? null,
    })
  }, [open, artifact, fetchedArtifact, reset])

  const onSubmit = async (data: ArtifactFormData) => {
    const chatDefaults = {
      skill_ids: data.skill_ids ?? [],
      collection_ids: data.collection_ids ?? [],
      mcp_tool_ids: data.mcp_tool_ids ?? [],
      html_template_id: data.html_template_id ?? null,
    }

    if (artifact) {
      await updateArtifact.mutateAsync({
        id: artifact.id,
        data: {
          name: data.name,
          title: data.title || undefined,
          description: data.description || undefined,
          prompt: data.prompt,
          apply_default: Boolean(data.apply_default),
          ...chatDefaults,
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
        ...chatDefaults,
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
    <MarkdownArtifactEditorShell
      open={open}
      onOpenChange={onOpenChange}
      header={
        <DialogTitle>
          {isEditing ? t('common.edit') : t('artifacts.createNew')}
        </DialogTitle>
      }
      onSave={handleSubmit(onSubmit)}
      onCancel={handleClose}
      isSaving={isSaving}
      disableSave={isEditing && isLoading}
      isLoading={isEditing && isLoading}
      loadingLabel={t('common.loading')}
      saveLabel={
        isEditing ? t('common.editArtifact') : t('artifacts.createNew')
      }
      savingLabel={
        isEditing ? `${t('common.saving')}...` : `${t('common.creating')}...`
      }
      bodyClassName={cn(dialogBodyClassName, 'space-y-3')}
    >
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>{t('artifacts.name')}</Label>
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
        <FieldError message={errors.name?.message} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={titleId}>{t('common.title')}</Label>
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
        <div className="flex items-center gap-2 md:pt-6">
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

      <div className="space-y-1.5">
        <Label htmlFor={descriptionId}>
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

      <div className="space-y-1.5">
        <Label htmlFor={promptId}>{t('artifacts.systemPrompt')}</Label>
        <Controller
          control={control}
          name="prompt"
          render={({ field }) => (
            <MarkdownEditor
              key={artifact?.id ?? 'new-artifact'}
              value={field.value}
              onChange={field.onChange}
              height={320}
              placeholder={t('artifacts.promptPlaceholder')}
              className="rounded-md border"
              textareaId={promptId}
              name={field.name}
            />
          )}
        />
        <FieldError message={errors.prompt?.message} />
        <p className="text-[11px] text-muted-foreground">
          {t('artifacts.promptHint')}
        </p>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">{t('artifacts.chatDefaults')}</p>
          <p className="text-[11px] text-muted-foreground">
            {t('artifacts.chatDefaultsHint')}
          </p>
        </div>
        <ChatDefaultsPickerRow control={control} />
      </div>
    </MarkdownArtifactEditorShell>
  )
}

'use client'

import { useEffect, useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter, dialogBodyClassName, dialogLargeContentClassName } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { SkillPicker } from '@/components/skills/SkillPicker'
import { ToolPicker } from '@/components/mcp/ToolPicker'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import { useCreateArtifact, useUpdateArtifact, useArtifact } from '@/lib/hooks/use-artifacts'
import { Artifact } from '@/lib/types/artifacts'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { DialogBodyLoading } from '@/components/common/LoadingSkeletons'
import { FieldError } from '@/components/common/FieldError'

const artifactSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1),
  apply_default: z.boolean().optional(),
  skill_ids: z.array(z.string()).default([]),
  mcp_tool_ids: z.array(z.string()).default([]),
  html_template_id: z.string().nullable().optional(),
})

type ArtifactFormData = z.infer<typeof artifactSchema>

const emptyFormValues: ArtifactFormData = {
  name: '',
  title: '',
  description: '',
  prompt: '',
  apply_default: false,
  skill_ids: [],
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
      mcp_tool_ids: source?.mcp_tool_ids ?? [],
      html_template_id: source?.html_template_id ?? null,
    })
  }, [open, artifact, fetchedArtifact, reset])

  const onSubmit = async (data: ArtifactFormData) => {
    const chatDefaults = {
      skill_ids: data.skill_ids ?? [],
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(dialogLargeContentClassName, 'overflow-hidden p-0')}>
        <DialogHeader className="border-b">
          <DialogTitle>
            {isEditing ? t('common.edit') : t('artifacts.createNew')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full min-h-0 flex-col">
          {isEditing && isLoading ? (
            <DialogBodyLoading label={t('common.loading')} />
          ) : (
            <div className={cn(dialogBodyClassName, 'space-y-3')}>
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
                <div className="flex flex-wrap items-center gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t('artifacts.defaultSkills')}
                    </Label>
                    <Controller
                      control={control}
                      name="skill_ids"
                      render={({ field }) => (
                        <SkillPicker
                          selectedSkillIds={field.value ?? []}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t('artifacts.defaultTools')}
                    </Label>
                    <Controller
                      control={control}
                      name="mcp_tool_ids"
                      render={({ field }) => (
                        <ToolPicker
                          selectedToolIds={field.value ?? []}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t('artifacts.defaultTemplate')}
                    </Label>
                    <Controller
                      control={control}
                      name="html_template_id"
                      render={({ field }) => (
                        <TemplatePicker
                          selectedTemplateId={field.value ?? null}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t">
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" className="h-7" disabled={isSaving || (isEditing && isLoading)}>
              {isSaving
                ? isEditing ? `${t('common.saving')}...` : `${t('common.creating')}...`
                : isEditing
                  ? t('common.editArtifact')
                  : t('artifacts.createNew')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

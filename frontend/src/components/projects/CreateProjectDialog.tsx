'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { FormDialogShell } from '@/components/common/FormDialogShell'
import { FieldError } from '@/components/common/FieldError'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCreateProject } from '@/lib/hooks/use-projects'
import { useTranslation } from '@/lib/hooks/use-translation'

const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

type CreateProjectFormData = z.infer<typeof createProjectSchema>

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { t } = useTranslation()
  const createProject = useCreateProject()
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const closeDialog = () => onOpenChange(false)

  const onSubmit = async (data: CreateProjectFormData) => {
    await createProject.mutateAsync(data)
    closeDialog()
    reset()
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset()
    }
    onOpenChange(nextOpen)
  }

  return (
    <FormDialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title={t('projects.createNew')}
      contentClassName="sm:max-w-md"
      compactFooter
      submitLabel={t('projects.createNew')}
      submittingLabel={t('common.creating')}
      disableSubmit={!isValid}
      isSubmitting={createProject.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="project-name">{t('common.name')} *</Label>
        <Input
          id="project-name"
          {...register('name')}
          placeholder={t('projects.namePlaceholder')}
          autoComplete="off"
        />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-description">{t('common.description')}</Label>
        <Textarea
          id="project-description"
          {...register('description')}
          placeholder={t('projects.descPlaceholder')}
          rows={3}
        />
      </div>
    </FormDialogShell>
  )
}

'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogBodyClassName,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCreateProject } from '@/lib/hooks/use-projects'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    if (!open) {
      reset()
    }
  }, [open, reset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projects.createNew')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className={cn(dialogBodyClassName, 'space-y-3')}>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">{t('common.name')} *</Label>
            <Input
              id="project-name"
              {...register('name')}
              placeholder={t('projects.namePlaceholder')}
              autoComplete="off"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
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

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={closeDialog}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" className="h-7" disabled={!isValid || createProject.isPending}>
              {createProject.isPending ? t('common.creating') : t('projects.createNew')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

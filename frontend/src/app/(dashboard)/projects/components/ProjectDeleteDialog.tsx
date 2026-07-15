'use client'

import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/hooks/use-translation'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Skeleton } from '@/components/ui/skeleton'
import { useProjectDeletePreview, useDeleteProject } from '@/lib/hooks/use-projects'
import { useRouter } from 'next/navigation'

interface ProjectDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  redirectAfterDelete?: boolean
}

export function ProjectDeleteDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  redirectAfterDelete = false,
}: ProjectDeleteDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [sourceAction, setSourceAction] = useState<'keep' | 'delete'>('keep')

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSourceAction('keep')
    }
  }, [open, projectId])

  // Fetch delete preview when dialog is open
  const { data: preview, isLoading: isLoadingPreview, error: previewError } = useProjectDeletePreview(
    projectId,
    open
  )

  const deleteProject = useDeleteProject()

  const handleConfirm = async () => {
    await deleteProject.mutateAsync({
      id: projectId,
      deleteExclusiveSources: sourceAction === 'delete',
    })
    onOpenChange(false)
    if (redirectAfterDelete) {
      router.push('/projects')
    }
  }

  const isDeleting = deleteProject.isPending

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('projects.deleteProject')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('projects.deleteProjectDesc').replace('{name}', projectName)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 px-1 py-1">
          {isLoadingPreview ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : previewError ? (
            <div className="text-sm text-destructive">
              {t('common.error')}: {previewError.message || 'Failed to load preview'}
            </div>
          ) : preview ? (
            <>
              {/* Notes section */}
              <div className="text-sm">
                {preview.note_count > 0 ? (
                  <p className="text-destructive font-medium">
                    {t('projects.deleteProjectNotes').replace(
                      '{count}',
                      String(preview.note_count)
                    )}
                  </p>
                ) : (
                  <p className="text-muted-foreground">{t('projects.deleteProjectNoNotes')}</p>
                )}
              </div>

              {/* Shared sources - always above the line */}
              {preview.shared_source_count > 0 && (
                <div className="text-sm">
                  <p className="text-muted-foreground">
                    {t('projects.deleteProjectSharedSources').replace(
                      '{count}',
                      String(preview.shared_source_count)
                    )}
                  </p>
                </div>
              )}

              {/* No sources message */}
              {preview.exclusive_source_count === 0 && preview.shared_source_count === 0 && (
                <div className="text-sm">
                  <p className="text-muted-foreground">{t('projects.deleteProjectNoSources')}</p>
                </div>
              )}

              {/* Exclusive sources section - below the line with radio buttons */}
              {preview.exclusive_source_count > 0 && (
                <div className="pt-3 border-t space-y-3">
                  <p className="text-sm text-destructive font-medium">
                    {t('projects.deleteProjectExclusiveSources').replace(
                      '{count}',
                      String(preview.exclusive_source_count)
                    )}
                  </p>
                  <RadioGroup
                    value={sourceAction}
                    onValueChange={(value) => setSourceAction(value as 'keep' | 'delete')}
                    disabled={isDeleting}
                  >
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="delete" id="delete-sources" />
                      <Label htmlFor="delete-sources" className="text-sm cursor-pointer">
                        {t('projects.deleteExclusiveSourcesLabel')}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="keep" id="keep-sources" />
                      <Label htmlFor="keep-sources" className="text-sm cursor-pointer">
                        {t('projects.keepExclusiveSourcesLabel')}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting || isLoadingPreview}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? (
              <>
                <InlineSkeleton className="mr-2" />
                {t('common.deleting')}
              </>
            ) : (
              t('common.delete')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

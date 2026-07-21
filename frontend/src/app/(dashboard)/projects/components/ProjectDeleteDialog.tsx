'use client'

import { useState, useEffect, type MouseEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/hooks/use-translation'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProjectDeletePreview, useDeleteProject } from '@/lib/hooks/use-projects'
import { useRouter } from 'next/navigation'
import { clearBodyPointerLock } from '@/lib/utils/clear-body-pointer-lock'

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
  const [confirmText, setConfirmText] = useState('')

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      clearBodyPointerLock()
    }
  }

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSourceAction('keep')
      setConfirmText('')
    }
  }, [open, projectId])

  // Fetch delete preview when dialog is open
  const { data: preview, isLoading: isLoadingPreview, error: previewError } = useProjectDeletePreview(
    projectId,
    open
  )

  const deleteProject = useDeleteProject()

  const nameMatches = confirmText === projectName
  const canConfirm =
    nameMatches && !isLoadingPreview && !previewError && !deleteProject.isPending

  const handleConfirm = async (event: MouseEvent) => {
    // Prevent Radix from racing close with DropdownMenu teardown, which
    // can leave document.body.style.pointerEvents = 'none'.
    event.preventDefault()
    if (!canConfirm) {
      return
    }

    try {
      await deleteProject.mutateAsync({
        id: projectId,
        deleteExclusiveSources: sourceAction === 'delete',
      })
      handleOpenChange(false)
      if (redirectAfterDelete) {
        router.push('/projects')
      }
    } catch {
      // Error toast handled by useDeleteProject; keep dialog open for retry
    }
  }

  const isDeleting = deleteProject.isPending

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('projects.deleteProject')}</AlertDialogTitle>
          <AlertDialogDescription className="select-text">
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

          {!isLoadingPreview && !previewError && (
            <div className="pt-3 border-t space-y-2">
              <Label
                htmlFor="delete-project-confirm"
                className="block text-sm font-medium leading-snug select-text"
              >
                {t('projects.deleteTypeConfirmLabel').replace('{name}', projectName)}
              </Label>
              <Input
                id="delete-project-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={t('projects.deleteTypeConfirmPlaceholder')}
                disabled={isDeleting}
                autoComplete="off"
                data-testid="delete-project-confirm-input"
              />
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={buttonVariants({ variant: 'destructive' })}
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

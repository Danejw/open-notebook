'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Brain, Pencil, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormDialogShell, formDialogFormClassName } from '@/components/common/FormDialogShell'
import { CompactListRowSkeleton } from '@/components/common/LoadingSkeletons'
import {
  ColumnHeader,
  columnHeaderGhostButtonClassName,
  columnHeaderIconButtonClassName,
  columnHeaderIconClassName,
} from '@/components/projects/ColumnHeader'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  useClearProjectMemory,
  useProjectMemory,
  useUpdateProjectMemory,
} from '@/lib/hooks/use-project-memory'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'
import { cn } from '@/lib/utils'

interface ProjectMemorySectionProps {
  projectId: string
}

export function ProjectMemorySection({ projectId }: ProjectMemorySectionProps) {
  const { t, language } = useTranslation()
  const { data: memory, isLoading } = useProjectMemory(projectId)
  const updateMemory = useUpdateProjectMemory(projectId)
  const clearMemory = useClearProjectMemory(projectId)

  const [editOpen, setEditOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const hasMemory = Boolean(memory?.content?.trim())

  useEffect(() => {
    if (editOpen) {
      setDraft(memory?.content ?? '')
    }
  }, [editOpen, memory?.content])

  const updatedLabel =
    memory?.updated_at != null
      ? t('common.updated').replace(
          '{time}',
          formatDistanceToNow(new Date(memory.updated_at), {
            addSuffix: true,
            locale: getDateLocale(language),
          })
        )
      : null

  const preview = (memory?.content ?? '').trim().replace(/\s+/g, ' ')

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await updateMemory.mutateAsync({ content: draft })
    setEditOpen(false)
  }

  return (
    <>
      <ColumnHeader
        title={t('projects.projectMemory')}
        actions={
          <>
            {hasMemory ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={columnHeaderIconButtonClassName}
                aria-label={t('projects.clearProjectMemory')}
                onClick={() => setClearOpen(true)}
                disabled={clearMemory.isPending}
              >
                <Trash2 className={columnHeaderIconClassName} />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(columnHeaderGhostButtonClassName)}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className={columnHeaderIconClassName} />
              {t('common.edit')}
            </Button>
          </>
        }
      />

      <div className="px-1 pb-1 pt-0.5">
        {isLoading ? (
          <CompactListRowSkeleton />
        ) : !hasMemory ? (
          <EmptyState
            icon={Brain}
            title={t('projects.noProjectMemoryYet')}
            description={t('projects.projectMemoryEmptyDesc')}
            className="px-3 py-3"
          />
        ) : (
          <div className="rounded-md border border-border/60 px-2.5 py-1.5">
            <p className="line-clamp-2 text-xs leading-snug text-foreground/90">{preview}</p>
            {updatedLabel ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{updatedLabel}</p>
            ) : null}
          </div>
        )}
      </div>

      <FormDialogShell
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t('projects.editProjectMemory')}
        contentClassName="sm:max-w-lg"
        compactFooter
        isSubmitting={updateMemory.isPending}
        disableSubmit={!draft.trim()}
        onSubmit={(event) => {
          void handleSave(event)
        }}
        formClassName={formDialogFormClassName}
      >
        <Textarea
          id="project-memory-content"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={12}
          className="min-h-[220px] font-mono text-xs"
          placeholder={t('projects.projectMemoryPlaceholder')}
        />
      </FormDialogShell>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={t('projects.clearProjectMemory')}
        description={t('projects.clearProjectMemoryConfirm')}
        confirmText={t('projects.clearProjectMemory')}
        confirmVariant="destructive"
        isLoading={clearMemory.isPending}
        onConfirm={() => {
          void clearMemory.mutateAsync()
        }}
      />
    </>
  )
}

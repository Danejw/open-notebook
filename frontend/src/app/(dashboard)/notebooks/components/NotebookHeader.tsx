'use client'

import { useState } from 'react'
import { NotebookResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useUpdateNotebook } from '@/lib/hooks/use-notebooks'
import { NotebookDeleteDialog } from './NotebookDeleteDialog'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils/date-locale'
import { InlineEdit } from '@/components/common/InlineEdit'
import { useTranslation } from '@/lib/hooks/use-translation'

interface NotebookHeaderProps {
  notebook: NotebookResponse
}

export function NotebookHeader({ notebook }: NotebookHeaderProps) {
  const { t, language } = useTranslation()
  const dfLocale = getDateLocale(language)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const updateNotebook = useUpdateNotebook()

  const handleUpdateName = async (name: string) => {
    if (!name || name === notebook.name) return

    await updateNotebook.mutateAsync({
      id: notebook.id,
      data: { name },
    })
  }

  const handleUpdateDescription = async (description: string) => {
    if (description === notebook.description) return

    await updateNotebook.mutateAsync({
      id: notebook.id,
      data: { description: description || undefined },
    })
  }

  const handleArchiveToggle = () => {
    updateNotebook.mutate({
      id: notebook.id,
      data: { archived: !notebook.archived },
    })
  }

  const createdLabel = t('common.created').replace(
    '{time}',
    formatDistanceToNow(new Date(notebook.created), { addSuffix: true, locale: dfLocale }),
  )
  const updatedLabel = t('common.updated').replace(
    '{time}',
    formatDistanceToNow(new Date(notebook.updated), { addSuffix: true, locale: dfLocale }),
  )

  return (
    <>
      <div className="border-b border-border py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            <InlineEdit
              id="notebook-name"
              name="notebook-name"
              value={notebook.name}
              onSave={handleUpdateName}
              className="text-base font-semibold leading-snug"
              inputClassName="text-base font-semibold"
              placeholder={t('notebooks.namePlaceholder')}
            />
            {notebook.archived ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {t('notebooks.archived')}
              </Badge>
            ) : null}
            <span className="hidden text-[11px] text-muted-foreground md:inline truncate">
              {createdLabel} · {updatedLabel}
            </span>
          </div>

          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleArchiveToggle}>
              {notebook.archived ? (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('notebooks.unarchive')}</span>
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('notebooks.archive')}</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{t('common.delete')}</span>
            </Button>
          </div>
        </div>

        <InlineEdit
          id="notebook-description"
          name="notebook-description"
          value={notebook.description || ''}
          onSave={handleUpdateDescription}
          className="mt-0.5 text-xs text-muted-foreground"
          inputClassName="text-xs text-muted-foreground"
          placeholder={t('notebooks.addDescription')}
          multiline
          emptyText={t('notebooks.addDescription')}
        />

        <div className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
          {createdLabel} · {updatedLabel}
        </div>
      </div>

      <NotebookDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        notebookId={notebook.id}
        notebookName={notebook.name}
        redirectAfterDelete
      />
    </>
  )
}

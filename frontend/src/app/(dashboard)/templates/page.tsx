'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileCode2, Pencil, Trash2, Upload } from 'lucide-react'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { EmptyState } from '@/components/common/EmptyState'
import { BulkDeleteConfirmDialog } from '@/components/common/BulkDeleteConfirmDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { ResourceList } from '@/components/common/ResourceList'
import { reportBulkResults, settleBulkActions } from '@/components/common/bulk-settle'
import { TemplateHtmlPreview } from '@/components/templates/TemplateHtmlPreview'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useCreateHtmlTemplate,
  useHtmlTemplates,
  useUpdateHtmlTemplate,
} from '@/lib/hooks/use-html-documents'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { HtmlTemplate } from '@/lib/types/html-documents'
import { htmlDocumentsApi } from '@/lib/api/html-documents'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  CompactListRow,
  CompactListRowActions,
  CompactListRowContent,
  CompactListRowIcon,
  CompactListRowMeta,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from '@/components/common/CompactListRow'

export default function TemplatesPage() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { data: templates = [], isLoading, refetch } = useHtmlTemplates()
  const createTemplate = useCreateHtmlTemplate()
  const updateTemplate = useUpdateHtmlTemplate()

  const [uploading, setUploading] = useState(false)
  const [renaming, setRenaming] = useState<HtmlTemplate | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<HtmlTemplate | null>(null)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const html_body = await file.text()
      const name = file.name.replace(/\.html?$/i, '') || t('templates.untitledTemplate')
      await createTemplate.mutateAsync({
        name,
        category: 'estimate',
        html_body,
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openRename = (template: HtmlTemplate) => {
    setRenaming(template)
    setRenameValue(template.name)
  }

  const handleRename = async () => {
    if (!renaming) return
    const name = renameValue.trim()
    if (!name || name === renaming.name) {
      setRenaming(null)
      return
    }
    await updateTemplate.mutateAsync({
      id: renaming.id,
      data: { name },
    })
    setRenaming(null)
  }

  const handleDeleteConfirm = async () => {
    if (!deleting) return
    await htmlDocumentsApi.deleteTemplate(deleting.id)
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.htmlTemplates })
    setDeleting(null)
  }

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDeleteIds?.length) return
    setBulkBusy(true)
    try {
      const { succeeded, failed } = await settleBulkActions(bulkDeleteIds, (id) =>
        htmlDocumentsApi.deleteTemplate(id)
      )
      reportBulkResults(t, succeeded, failed)
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.htmlTemplates })
      setBulkDeleteIds(null)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('templates.title')}
          actions={
            <div className="flex items-center gap-1">
              <PageRefreshButton onClick={() => refetch()} />
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,text/html"
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
              <Button
                size="sm"
                className="h-7 gap-1.5"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {t('templates.uploadTemplate')}
              </Button>
            </div>
          }
        />

        <ResourceList
          title={t('templates.title')}
          items={templates}
          getItemId={(template) => template.id}
          isLoading={isLoading}
          empty={<EmptyState icon={FileCode2} title={t('templates.emptyTemplates')} />}
          formatSelectedCount={(count) =>
            t('common.selectedItems').replace('{count}', count.toString())
          }
          bulkActions={({ selectedIds }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              disabled={bulkBusy || selectedIds.length === 0}
              onClick={() => setBulkDeleteIds(selectedIds)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('common.bulkDelete')}
            </Button>
          )}
          renderItem={(template, ctx) => (
            <CompactListRow
              as="div"
              hover={!ctx.selectionMode}
              onClick={
                ctx.selectionMode ? () => ctx.onToggle(!ctx.selected) : undefined
              }
            >
              <CompactListRowIcon>
                <FileCode2 aria-hidden />
              </CompactListRowIcon>
              <CompactListRowContent>
                <CompactListRowTitleRow>
                  <CompactListRowTitle className="leading-snug">{template.name}</CompactListRowTitle>
                </CompactListRowTitleRow>
                <CompactListRowMeta className="leading-tight">{template.category}</CompactListRowMeta>
              </CompactListRowContent>
              {!ctx.selectionMode ? (
                <CompactListRowActions>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    aria-label={t('templates.renameTemplate')}
                    onClick={() => openRename(template)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(template)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CompactListRowActions>
              ) : null}
            </CompactListRow>
          )}
        />

        <details className="rounded-md border border-dashed text-xs">
          <summary className="cursor-pointer select-none px-3 py-1.5 font-medium">
            {t('templates.printChecklistTitle')}
          </summary>
          <div className="space-y-1 border-t border-dashed px-3 py-2 text-muted-foreground">
            <p>{t('templates.printChecklistIntro')}</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>{t('templates.printChecklistFlow')}</li>
              <li>{t('templates.printChecklistPage')}</li>
              <li>{t('templates.printChecklistAvoid')}</li>
              <li>{t('templates.printChecklistBreak')}</li>
            </ul>
          </div>
        </details>
      </div>

      <FormDialogShell
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        title={t('templates.renameTemplate')}
        isSubmitting={updateTemplate.isPending}
        compactFooter
        contentClassName="sm:max-w-2xl"
        disableSubmit={!renameValue.trim()}
        onSubmit={(event) => {
          event.preventDefault()
          void handleRename()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="template-rename-name">{t('common.name')}</Label>
          <Input
            id="template-rename-name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
          />
        </div>
        {renaming?.html_body ? (
          <TemplateHtmlPreview
            html={renaming.html_body}
            title={renaming.name}
            maxHeightPx={360}
          />
        ) : null}
      </FormDialogShell>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('common.delete')}
        description={t('templates.confirmDeleteTemplate')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => void handleDeleteConfirm()}
      />

      <BulkDeleteConfirmDialog
        ids={bulkDeleteIds}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteIds(null)
        }}
        onConfirm={() => void handleBulkDeleteConfirm()}
        isLoading={bulkBusy}
      />
    </div>
  )
}

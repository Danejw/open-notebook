'use client'

import { useRef, useState } from 'react'
import { FileCode2, Pencil, Trash2, Upload } from 'lucide-react'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { EmptyState } from '@/components/common/EmptyState'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { TemplateHtmlPreview } from '@/components/templates/TemplateHtmlPreview'
import {
  useCreateHtmlTemplate,
  useDeleteHtmlTemplate,
  useHtmlTemplates,
  useUpdateHtmlTemplate,
} from '@/lib/hooks/use-html-documents'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { HtmlTemplate } from '@/lib/types/html-documents'
import { listActionTriggerClassName } from '@/lib/utils/list-action-trigger'

export default function TemplatesPage() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: templates = [], isLoading, refetch } = useHtmlTemplates()
  const createTemplate = useCreateHtmlTemplate()
  const updateTemplate = useUpdateHtmlTemplate()
  const deleteTemplate = useDeleteHtmlTemplate()

  const [uploading, setUploading] = useState(false)
  const [renaming, setRenaming] = useState<HtmlTemplate | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<HtmlTemplate | null>(null)

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
    await deleteTemplate.mutateAsync(deleting.id)
    setDeleting(null)
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

        {isLoading ? (
          <ListRowsSkeleton rows={4} withHeader={false} />
        ) : templates.length === 0 ? (
          <EmptyState icon={FileCode2} title={t('templates.emptyTemplates')} />
        ) : (
          <ul className="divide-y rounded-md border">
            {templates.map((template) => (
              <li
                key={template.id}
                className="group flex items-center gap-2 px-3 py-1.5"
              >
                <FileCode2
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-snug">{template.name}</p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    {template.category}
                  </p>
                </div>
                <div className={cn('flex shrink-0 items-center gap-0.5', listActionTriggerClassName)}>
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
                </div>
              </li>
            ))}
          </ul>
        )}

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
        isLoading={deleteTemplate.isPending}
      />
    </div>
  )
}

'use client'

import { Copy, Download, Image as ImageIcon, Pencil, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { DocumentWorkspace } from '@/app/(dashboard)/documents/[id]/hooks/useDocumentWorkspace'

type DocumentWorkspaceViewProps = Pick<
  DocumentWorkspace,
  | 'document'
  | 'documentId'
  | 'codeDraft'
  | 'setCodeDraft'
  | 'activeTab'
  | 'setActiveTab'
  | 'spans'
  | 'iframeRef'
  | 'setSaveDialogOpen'
  | 'setDuplicateOpen'
  | 'setRenameOpen'
  | 'setRenameTitle'
  | 'setScenarioLabel'
  | 'setImagePickerOpen'
  | 'setReplaceImgIndex'
  | 'setReplaceSlug'
  | 'setDeleteOpen'
  | 'exportPdf'
  | 'deleteDocument'
  | 'handleAmountChange'
>

export function DocumentWorkspaceView(props: DocumentWorkspaceViewProps) {
  const { t } = useTranslation()
  const document = props.document
  if (!document) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 pb-4">
      <PageHeader
        title={document.title}
        description={`${t('documents.scenario')}: ${document.scenario_label}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              onClick={() => {
                props.setReplaceImgIndex(null)
                props.setReplaceSlug(null)
                props.setImagePickerOpen(true)
              }}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {t('documents.insertImage')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              onClick={() => {
                props.setRenameTitle(document.title)
                props.setRenameOpen(true)
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('documents.renameDocument')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              onClick={() => {
                props.setScenarioLabel('')
                props.setDuplicateOpen(true)
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {t('documents.duplicate')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1"
              disabled={props.exportPdf.isPending}
              onClick={() => void props.exportPdf.mutateAsync(props.documentId)}
            >
              <Download className="h-3.5 w-3.5" />
              {t('documents.exportPdf')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-destructive"
              disabled={props.deleteDocument.isPending}
              onClick={() => props.setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('common.delete')}
            </Button>
          </div>
        }
      />

      <Tabs
        value={props.activeTab}
        onValueChange={props.setActiveTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="w-fit">
          <TabsTrigger value="page">{t('documents.tabPage')}</TabsTrigger>
          <TabsTrigger value="amounts">{t('documents.tabAmounts')}</TabsTrigger>
          <TabsTrigger value="code">{t('documents.tabCode')}</TabsTrigger>
        </TabsList>

        <TabsContent value="page" className="min-h-0 flex-1">
          <iframe
            ref={props.iframeRef}
            title={t('documents.pagePreview')}
            className="h-[min(70vh,720px)] w-full rounded-md border bg-white"
            sandbox="allow-same-origin"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t('documents.pageEditHint')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('documents.imageEditHint')}
          </p>
        </TabsContent>

        <TabsContent value="amounts" className="min-h-0 flex-1 overflow-y-auto">
          {props.spans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('documents.noSpans')}</p>
          ) : (
            <ul className="space-y-3">
              {props.spans.map((span) => (
                <li key={span.index} className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    {t('documents.spanLabel').replace(
                      '{index}',
                      String(span.index + 1)
                    )}
                  </label>
                  <Input
                    defaultValue={span.text}
                    key={`${span.index}-${span.text}`}
                    onBlur={(e) => {
                      if (e.target.value !== span.text) {
                        void props.handleAmountChange(span.index, e.target.value)
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="code" className="flex min-h-0 flex-1 flex-col gap-3">
          <Textarea
            value={props.codeDraft}
            onChange={(e) => props.setCodeDraft(e.target.value)}
            className="min-h-[min(60vh,640px)] font-mono text-xs"
            spellCheck={false}
          />
          <div>
            <Button
              size="sm"
              className="h-7 gap-1"
              onClick={() => props.setSaveDialogOpen(true)}
            >
              <Save className="h-3.5 w-3.5" />
              {t('documents.saveCode')}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

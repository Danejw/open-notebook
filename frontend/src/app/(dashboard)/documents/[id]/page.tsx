'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Copy, Download, Save } from 'lucide-react'
import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useBidDocument,
  useDuplicateBidDocument,
  useExportBidDocumentPdf,
  useUpdateBidDocument,
  useUpdateHtmlTemplate,
} from '@/lib/hooks/use-html-documents'
import { useTranslation } from '@/lib/hooks/use-translation'
import { extractSpans } from '@/lib/utils/html-spans'

export default function DocumentWorkspacePage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const documentId = typeof params.id === 'string' ? params.id : ''
  const { data: document, isLoading } = useBidDocument(documentId)
  const updateDocument = useUpdateBidDocument()
  const updateTemplate = useUpdateHtmlTemplate()
  const duplicateDocument = useDuplicateBidDocument()
  const exportPdf = useExportBidDocumentPdf()

  const [htmlBody, setHtmlBody] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [activeTab, setActiveTab] = useState('page')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [scenarioLabel, setScenarioLabel] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (document?.html_body != null) {
      setHtmlBody(document.html_body)
      setCodeDraft(document.html_body)
    }
  }, [document?.html_body])

  const spans = useMemo(() => extractSpans(htmlBody), [htmlBody])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || activeTab !== 'page') return

    const doc = iframe.contentDocument
    if (!doc) return

    doc.open()
    doc.write(htmlBody)
    doc.close()

    const spanEls = Array.from(doc.querySelectorAll('span'))
    const cleanups: Array<() => void> = []

    spanEls.forEach((el, index) => {
      el.setAttribute('contenteditable', 'true')
      el.style.outline = '1px dashed rgba(37, 99, 235, 0.35)'
      el.style.cursor = 'text'
      const onBlur = () => {
        const text = el.textContent ?? ''
        void updateDocument
          .mutateAsync({
            id: documentId,
            data: { span_updates: { [index]: text } },
          })
          .then((updated) => {
            setHtmlBody(updated.html_body)
            setCodeDraft(updated.html_body)
          })
      }
      el.addEventListener('blur', onBlur)
      cleanups.push(() => el.removeEventListener('blur', onBlur))
    })

    return () => {
      cleanups.forEach((fn) => fn())
    }
    // mutateAsync identity is stable enough for blur saves; avoid re-binding on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit updateDocument
  }, [htmlBody, activeTab, documentId])

  const handleAmountChange = async (index: number, text: string) => {
    const updated = await updateDocument.mutateAsync({
      id: documentId,
      data: { span_updates: { [index]: text } },
    })
    setHtmlBody(updated.html_body)
    setCodeDraft(updated.html_body)
  }

  const handleSaveToDocument = async () => {
    const updated = await updateDocument.mutateAsync({
      id: documentId,
      data: { html_body: codeDraft, allow_structure_change: true },
    })
    setHtmlBody(updated.html_body)
    setCodeDraft(updated.html_body)
    setSaveDialogOpen(false)
  }

  const handleUpdateTemplate = async () => {
    if (!document?.template_id) return
    // Keep this document in sync with Code, then update the shared template
    // (existing scenario copies are left unchanged).
    const updated = await updateDocument.mutateAsync({
      id: documentId,
      data: { html_body: codeDraft, allow_structure_change: true },
    })
    setHtmlBody(updated.html_body)
    setCodeDraft(updated.html_body)
    await updateTemplate.mutateAsync({
      id: document.template_id,
      data: { html_body: updated.html_body },
    })
    setSaveDialogOpen(false)
  }

  const handleDuplicate = async () => {
    const label = scenarioLabel.trim()
    if (!label) return
    const dup = await duplicateDocument.mutateAsync({
      id: documentId,
      data: { scenario_label: label },
    })
    setDuplicateOpen(false)
    router.push(`/documents/${dup.id}`)
  }

  if (isLoading || !document) {
    return (
      <div className={`${pageContentClassName} py-8`}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`${pageContentClassName} flex min-h-0 flex-1 flex-col gap-4 pb-4`}>
        <PageHeader
          bordered
          title={document.title}
          description={`${t('documents.scenario')}: ${document.scenario_label}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1"
                onClick={() => {
                  setScenarioLabel('')
                  setDuplicateOpen(true)
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {t('documents.duplicate')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1"
                disabled={exportPdf.isPending}
                onClick={() => void exportPdf.mutateAsync(documentId)}
              >
                <Download className="h-3.5 w-3.5" />
                {t('documents.exportPdf')}
              </Button>
            </div>
          }
        />

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="w-fit">
            <TabsTrigger value="page">{t('documents.tabPage')}</TabsTrigger>
            <TabsTrigger value="amounts">{t('documents.tabAmounts')}</TabsTrigger>
            <TabsTrigger value="code">{t('documents.tabCode')}</TabsTrigger>
          </TabsList>

          <TabsContent value="page" className="min-h-0 flex-1">
            <iframe
              ref={iframeRef}
              title={t('documents.pagePreview')}
              className="h-[min(70vh,720px)] w-full rounded-md border bg-white"
              sandbox="allow-same-origin"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t('documents.pageEditHint')}
            </p>
          </TabsContent>

          <TabsContent value="amounts" className="min-h-0 flex-1 overflow-y-auto">
            {spans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('documents.noSpans')}
              </p>
            ) : (
              <ul className="space-y-3">
                {spans.map((span) => (
                  <li key={span.index} className="grid gap-1">
                    <label className="text-xs text-muted-foreground">
                      {t('documents.spanLabel').replace('{index}', String(span.index + 1))}
                    </label>
                    <Input
                      defaultValue={span.text}
                      key={`${span.index}-${span.text}`}
                      onBlur={(e) => {
                        if (e.target.value !== span.text) {
                          void handleAmountChange(span.index, e.target.value)
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
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              className="min-h-[min(60vh,640px)] font-mono text-xs"
              spellCheck={false}
            />
            <div>
              <Button
                size="sm"
                className="h-7 gap-1"
                onClick={() => setSaveDialogOpen(true)}
              >
                <Save className="h-3.5 w-3.5" />
                {t('documents.saveCode')}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documents.saveCodeTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('documents.saveCodeDesc')}
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => void handleSaveToDocument()}>
              {t('documents.saveToDocument')}
            </Button>
            <Button
              variant="secondary"
              disabled={!document.template_id}
              onClick={() => void handleUpdateTemplate()}
            >
              {t('documents.updateTemplate')}
            </Button>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documents.duplicate')}</DialogTitle>
          </DialogHeader>
          <Input
            value={scenarioLabel}
            onChange={(e) => setScenarioLabel(e.target.value)}
            placeholder={t('documents.scenarioPlaceholder')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!scenarioLabel.trim() || duplicateDocument.isPending}
              onClick={() => void handleDuplicate()}
            >
              {t('documents.createScenario')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

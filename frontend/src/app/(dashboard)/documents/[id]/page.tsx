'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Copy, Download, Image as ImageIcon, Pencil, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { DetailPageSkeleton } from '@/components/common/LoadingSkeletons'
import { ImageLibraryPicker } from '@/components/media/ImageLibraryPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  useDeleteBidDocument,
  useDuplicateBidDocument,
  useExportBidDocumentPdf,
  useUpdateBidDocument,
  useUpdateHtmlTemplate,
} from '@/lib/hooks/use-html-documents'
import { useMediaAssets } from '@/lib/hooks/use-media'
import { useTranslation } from '@/lib/hooks/use-translation'
import { extractSpans } from '@/lib/utils/html-spans'
import { mediaImgMarkup, resolveMediaInHtml } from '@/lib/utils/resolve-media-html'
import type { MediaAsset } from '@/lib/types/media'

export default function DocumentWorkspacePage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const documentId = typeof params.id === 'string' ? params.id : ''
  const { data: document, isLoading } = useBidDocument(documentId)
  const { data: mediaAssets = [] } = useMediaAssets()
  const updateDocument = useUpdateBidDocument()
  const updateTemplate = useUpdateHtmlTemplate()
  const duplicateDocument = useDuplicateBidDocument()
  const deleteDocument = useDeleteBidDocument()
  const exportPdf = useExportBidDocumentPdf()

  const [htmlBody, setHtmlBody] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [activeTab, setActiveTab] = useState('page')
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [scenarioLabel, setScenarioLabel] = useState('')
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [replaceImgIndex, setReplaceImgIndex] = useState<number | null>(null)
  const [replaceSlug, setReplaceSlug] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
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

    let cancelled = false
    const cleanups: Array<() => void> = []

    const setup = async () => {
      const resolved = await resolveMediaInHtml(htmlBody, mediaAssets)
      if (cancelled) return
      const doc = iframe.contentDocument
      if (!doc) return

      doc.open()
      doc.write(resolved)
      doc.close()
      if (cancelled) return

      const spanEls = Array.from(doc.querySelectorAll('span'))
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

      const imgEls = Array.from(doc.querySelectorAll('img'))
      imgEls.forEach((el, index) => {
        el.style.outline = '1px dashed rgba(16, 185, 129, 0.45)'
        el.style.cursor = 'pointer'
        const onClick = (event: Event) => {
          event.preventDefault()
          event.stopPropagation()
          const slug = el.getAttribute('data-media-slug')
          setReplaceSlug(slug)
          setReplaceImgIndex(index)
          setImagePickerOpen(true)
        }
        el.addEventListener('click', onClick)
        cleanups.push(() => el.removeEventListener('click', onClick))
      })
    }

    void setup()

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
    }
    // mutateAsync identity is stable enough for blur saves; avoid re-binding on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit updateDocument
  }, [htmlBody, activeTab, documentId, mediaAssets])

  const persistHtml = async (nextHtml: string) => {
    const updated = await updateDocument.mutateAsync({
      id: documentId,
      data: { html_body: nextHtml, allow_structure_change: true },
    })
    setHtmlBody(updated.html_body)
    setCodeDraft(updated.html_body)
  }

  const handleSelectImage = (asset: MediaAsset) => {
    const markup = mediaImgMarkup(asset)
    if (replaceSlug) {
      const tokenRe = new RegExp(
        `\\{\\{\\s*image\\s*:\\s*${replaceSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`,
        'gi'
      )
      if (tokenRe.test(htmlBody)) {
        setReplaceSlug(null)
        setReplaceImgIndex(null)
        void persistHtml(htmlBody.replace(tokenRe, markup))
        return
      }
      const slugAttrRe = new RegExp(
        `data-media-slug=["']${replaceSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
        'i'
      )
      let replaced = false
      const next = htmlBody.replace(/<img\b[^>]*>/gi, (match) => {
        if (!replaced && slugAttrRe.test(match)) {
          replaced = true
          return markup
        }
        return match
      })
      setReplaceSlug(null)
      setReplaceImgIndex(null)
      if (replaced) {
        void persistHtml(next)
        return
      }
    }
    if (replaceImgIndex != null) {
      let count = 0
      const next = htmlBody.replace(/<img\b[^>]*>/gi, (match) => {
        if (count === replaceImgIndex) {
          count += 1
          return markup
        }
        count += 1
        return match
      })
      setReplaceSlug(null)
      setReplaceImgIndex(null)
      void persistHtml(next)
      return
    }
    // Insert near the top of body when possible; otherwise append.
    const bodyOpen = /<body([^>]*)>/i.exec(htmlBody)
    if (bodyOpen && bodyOpen.index != null) {
      const insertAt = bodyOpen.index + bodyOpen[0].length
      const next =
        htmlBody.slice(0, insertAt) + `\n${markup}\n` + htmlBody.slice(insertAt)
      void persistHtml(next)
      return
    }
    void persistHtml(`${htmlBody}\n${markup}`)
  }

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

  const handleRename = async () => {
    if (!document) return
    const title = renameTitle.trim()
    if (!title || title === document.title) {
      setRenameOpen(false)
      return
    }
    await updateDocument.mutateAsync({
      id: documentId,
      data: { title },
    })
    setRenameOpen(false)
  }

  const handleDelete = async () => {
    if (!document) return
    const projectId = document.project_id
    await deleteDocument.mutateAsync({ id: documentId, projectId })
    setDeleteOpen(false)
    router.push(`/projects/${projectId}`)
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (!document) {
    return (
      <div className="p-6 py-8">
        <p className="text-sm text-muted-foreground">{t('common.error')}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                  setReplaceImgIndex(null)
                  setReplaceSlug(null)
                  setImagePickerOpen(true)
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
                  setRenameTitle(document.title)
                  setRenameOpen(true)
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
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-destructive"
                disabled={deleteDocument.isPending}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('common.delete')}
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
            <p className="mt-1 text-xs text-muted-foreground">
              {t('documents.imageEditHint')}
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

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('documents.renameDocument')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleRename()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="document-rename-title">{t('common.title')}</Label>
              <Input
                id="document-rename-title"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={!renameTitle.trim() || updateDocument.isPending}
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImageLibraryPicker
        open={imagePickerOpen}
        onOpenChange={(open) => {
          setImagePickerOpen(open)
          if (!open) {
            setReplaceImgIndex(null)
            setReplaceSlug(null)
          }
        }}
        onSelect={handleSelectImage}
        title={
          replaceImgIndex != null || replaceSlug
            ? t('documents.replaceImage')
            : t('documents.insertImage')
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('common.delete')}
        description={t('documents.confirmDeleteDocument')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={deleteDocument.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

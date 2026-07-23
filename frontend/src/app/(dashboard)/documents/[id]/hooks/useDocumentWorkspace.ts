'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  useBidDocument,
  useDeleteBidDocument,
  useDuplicateBidDocument,
  useExportBidDocumentPdf,
  useUpdateBidDocument,
  useUpdateHtmlTemplate,
} from '@/lib/hooks/use-html-documents'
import { useMediaAssets } from '@/lib/hooks/use-media'
import { extractSpans } from '@/lib/utils/html-spans'
import { mediaImgMarkup, resolveMediaInHtml } from '@/lib/utils/resolve-media-html'
import type { MediaAsset } from '@/lib/types/media'

/**
 * Document workspace state, iframe setup, and mutation handlers.
 */
export function useDocumentWorkspace() {
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

  return {
    document,
    isLoading,
    documentId,
    htmlBody,
    codeDraft,
    setCodeDraft,
    activeTab,
    setActiveTab,
    spans,
    iframeRef,
    saveDialogOpen,
    setSaveDialogOpen,
    duplicateOpen,
    setDuplicateOpen,
    renameOpen,
    setRenameOpen,
    renameTitle,
    setRenameTitle,
    scenarioLabel,
    setScenarioLabel,
    imagePickerOpen,
    setImagePickerOpen,
    replaceImgIndex,
    setReplaceImgIndex,
    replaceSlug,
    setReplaceSlug,
    deleteOpen,
    setDeleteOpen,
    updateDocument,
    duplicateDocument,
    deleteDocument,
    exportPdf,
    handleSelectImage,
    handleAmountChange,
    handleSaveToDocument,
    handleUpdateTemplate,
    handleDuplicate,
    handleRename,
    handleDelete,
  }
}

export type DocumentWorkspace = ReturnType<typeof useDocumentWorkspace>

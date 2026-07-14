'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileCode2, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProjects } from '@/lib/hooks/use-projects'
import {
  useCreateBidDocument,
  useCreateHtmlTemplate,
  useDeleteHtmlTemplate,
  useHtmlTemplates,
} from '@/lib/hooks/use-html-documents'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { HtmlTemplate } from '@/lib/types/html-documents'

export default function DocumentsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: templates = [], isLoading, refetch } = useHtmlTemplates()
  const { data: projects = [] } = useProjects()
  const createTemplate = useCreateHtmlTemplate()
  const deleteTemplate = useDeleteHtmlTemplate()
  const createDocument = useCreateBidDocument()

  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<HtmlTemplate | null>(null)
  const [projectId, setProjectId] = useState('')
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const html_body = await file.text()
      const name = file.name.replace(/\.html?$/i, '') || t('documents.untitledTemplate')
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

  const openCreateDocument = (template: HtmlTemplate) => {
    setSelectedTemplate(template)
    setProjectId(projects[0]?.id ?? '')
    setCreateOpen(true)
  }

  const handleCreateDocument = async () => {
    if (!selectedTemplate || !projectId) return
    const doc = await createDocument.mutateAsync({
      projectId,
      data: { template_id: selectedTemplate.id },
    })
    setCreateOpen(false)
    router.push(`/documents/${doc.id}`)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`${pageContentClassName} space-y-6`}>
        <PageHeader
          bordered
          title={t('documents.title')}
          description={t('documents.desc')}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => refetch()}
                aria-label={t('common.refresh')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
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
                {t('documents.uploadTemplate')}
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <FileCode2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('documents.emptyTemplates')}</p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1"
                    onClick={() => openCreateDocument(template)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('documents.newDocument')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => {
                      if (window.confirm(t('documents.confirmDeleteTemplate'))) {
                        void deleteTemplate.mutateAsync(template.id)
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          <Link href="/projects" className="underline underline-offset-2">
            {t('documents.openFromProjectHint')}
          </Link>
        </p>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('documents.newDocument')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {selectedTemplate?.name}
            </p>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder={t('documents.selectProject')} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!projects.length ? (
              <Input disabled value={t('documents.noProjects')} />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!projectId || createDocument.isPending}
              onClick={() => void handleCreateDocument()}
            >
              {t('documents.createDocument')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

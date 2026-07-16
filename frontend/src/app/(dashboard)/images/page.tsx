'use client'

import { useRef, useState } from 'react'
import { Copy, Image as ImageIcon, Pencil, Trash2, Upload } from 'lucide-react'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { EmptyState } from '@/components/common/EmptyState'
import { ColumnCardsSkeleton } from '@/components/common/LoadingSkeletons'
import { MediaThumbnail } from '@/components/media/MediaThumbnail'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useDeleteMediaAsset,
  useMediaAssets,
  useUpdateMediaAsset,
  useUploadMediaAsset,
} from '@/lib/hooks/use-media'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useToast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { mediaToken } from '@/lib/utils/resolve-media-html'
import type { MediaAsset } from '@/lib/types/media'

const ACCEPT_IMAGES = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif,.png,.jpg,.jpeg,.webp,.svg,.gif'

export default function ImagesPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: assets = [], isLoading, refetch } = useMediaAssets()
  const uploadAsset = useUploadMediaAsset()
  const updateAsset = useUpdateMediaAsset()
  const deleteAsset = useDeleteMediaAsset()

  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<MediaAsset | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [deleting, setDeleting] = useState<MediaAsset | null>(null)

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      await uploadAsset.mutateAsync({ file })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openEdit = (asset: MediaAsset) => {
    setEditing(asset)
    setEditName(asset.name)
    setEditSlug(asset.slug)
  }

  const handleEdit = async () => {
    if (!editing) return
    const name = editName.trim()
    const slug = editSlug.trim()
    if (!name || !slug) return
    if (name === editing.name && slug === editing.slug) {
      setEditing(null)
      return
    }
    await updateAsset.mutateAsync({
      id: editing.id,
      data: { name, slug },
    })
    setEditing(null)
  }

  const handleCopyToken = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(mediaToken(asset))
      toast({
        title: t('common.success'),
        description: t('images.tokenCopied'),
      })
    } catch {
      toast({
        title: t('common.error'),
        description: t('images.tokenCopyFailed'),
        variant: 'destructive',
      })
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleting) return
    await deleteAsset.mutateAsync(deleting.id)
    setDeleting(null)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('images.title')}
          actions={
            <div className="flex items-center gap-1">
              <PageRefreshButton onClick={() => refetch()} />
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_IMAGES}
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
              <Button
                size="sm"
                className="h-7 gap-1.5"
                disabled={uploading || uploadAsset.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {t('images.upload')}
              </Button>
            </div>
          }
        />

        <p className="text-xs text-muted-foreground">{t('images.desc')}</p>

        {isLoading ? (
          <ColumnCardsSkeleton count={5} />
        ) : assets.length === 0 ? (
          <EmptyState icon={ImageIcon} title={t('images.empty')} />
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="group flex flex-col overflow-hidden rounded-md border"
              >
                <div className="flex h-28 items-center justify-center bg-muted/40 p-2">
                  <MediaThumbnail
                    mediaId={asset.id}
                    alt={asset.name}
                    className="max-h-full max-w-full"
                  />
                </div>
                <div className="space-y-1 border-t px-2 py-1.5">
                  <p className="truncate text-sm leading-snug">{asset.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {mediaToken(asset)}
                  </p>
                  <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      aria-label={t('images.copyToken')}
                      onClick={() => void handleCopyToken(asset)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      aria-label={t('images.edit')}
                      onClick={() => openEdit(asset)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive"
                      aria-label={t('common.delete')}
                      onClick={() => setDeleting(asset)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details className="rounded-md border border-dashed text-xs">
          <summary className="cursor-pointer select-none px-3 py-1.5 font-medium">
            {t('images.usageTitle')}
          </summary>
          <div className="space-y-1 border-t border-dashed px-3 py-2 text-muted-foreground">
            <p>{t('images.usageToken')}</p>
            <p>{t('images.usagePicker')}</p>
          </div>
        </details>
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('images.edit')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3 px-1 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              void handleEdit()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="media-edit-name">{t('common.name')}</Label>
              <Input
                id="media-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="media-edit-slug">{t('images.slug')}</Label>
              <Input
                id="media-edit-slug"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">{t('images.slugHint')}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-7"
                disabled={!editName.trim() || !editSlug.trim() || updateAsset.isPending}
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('common.delete')}
        description={t('images.confirmDelete')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => void handleDeleteConfirm()}
        isLoading={deleteAsset.isPending}
      />
    </div>
  )
}

'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogBodyClassName,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  useImportCollectionConfirm,
  useImportCollectionPreview,
} from '@/lib/hooks/use-collections'
import { CollectionImportPreview } from '@/lib/types/collections'
import { useTranslation } from '@/lib/hooks/use-translation'

interface CollectionImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CollectionImportDialog({
  open,
  onOpenChange,
}: CollectionImportDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importPreview = useImportCollectionPreview()
  const importConfirm = useImportCollectionConfirm()

  const [preview, setPreview] = useState<CollectionImportPreview | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setName('')
      setDescription('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [open])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const result = await importPreview.mutateAsync(file)
    setPreview(result)
    setName(result.name || result.root_name || '')
    setDescription(result.description || '')
  }

  const canConfirm =
    preview &&
    preview.errors.length === 0 &&
    name.trim().length > 0 &&
    description.trim().length > 0

  const handleConfirm = async () => {
    if (!preview || !canConfirm) return
    const created = await importConfirm.mutateAsync({
      name: name.trim(),
      slug: preview.slug ?? undefined,
      description: description.trim(),
      items: preview.items,
      tags: [],
      use_when: [],
      manifest_raw: '',
    })
    onOpenChange(false)
    router.push(`/collections/${created.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('collections.importTitle')}</DialogTitle>
        </DialogHeader>
        <div className={dialogBodyClassName}>
          <div className="space-y-1.5">
            <div className="space-y-0.5">
              <Label htmlFor={fileInputId}>{t('collections.uploadZip')}</Label>
              <Input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
              />
            </div>
            {importPreview.isPending ? (
              <p className="text-sm text-muted-foreground">{t('collections.importReviewing')}</p>
            ) : null}
            {preview?.errors.length ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-1.5 text-sm text-destructive">
                <p className="font-medium">{t('collections.importErrors')}</p>
                <ul className="mt-0.5 list-disc pl-4 text-[11px]">
                  {preview.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preview && preview.errors.length === 0 ? (
              <>
                <div className="space-y-0.5">
                  <Label htmlFor="import-name">{t('common.name')}</Label>
                  <Input
                    id="import-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="import-description">{t('common.description')}</Label>
                  <Textarea
                    id="import-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('collections.importItems').replace(
                    '{count}',
                    preview.items.length.toString()
                  )}
                </p>
              </>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!canConfirm || importConfirm.isPending} onClick={handleConfirm}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {t('collections.importConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

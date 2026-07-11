'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useImportSkillConfirm, useImportSkillPreview } from '@/lib/hooks/use-skills'
import { ImportPreview } from '@/lib/types/skills'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SkillImportDialog({ open, onOpenChange }: SkillImportDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const fileInputId = useId()
  const nameId = useId()
  const descriptionId = useId()
  const tagsId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importPreview = useImportSkillPreview()
  const importConfirm = useImportSkillConfirm()

  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setName('')
      setDescription('')
      setTagsInput('')
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

  const handleConfirm = async () => {
    if (!preview || !name.trim()) return

    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    const skill = await importConfirm.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      tags,
      files: preview.files,
    })

    onOpenChange(false)
    router.push(`/skills/${skill.id}`)
  }

  const hasBlockingErrors = (preview?.errors.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('skills.importTitle')}</DialogTitle>
          <DialogDescription>{t('skills.importDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fileInputId}>{t('skills.uploadZip')}</Label>
            <Input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              disabled={importPreview.isPending}
            />
          </div>

          {importPreview.isPending && (
            <p className="text-sm text-muted-foreground">{t('skills.importReviewing')}</p>
          )}

          {preview && (
            <div className="space-y-4 border rounded-md p-4">
              <h3 className="font-medium">{t('skills.importReview')}</h3>

              {preview.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  <p className="text-sm font-medium text-destructive">{t('skills.importErrors')}</p>
                  <ul className="list-disc pl-5 text-sm text-destructive space-y-1">
                    {preview.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                  <p className="text-sm font-medium">{t('skills.importWarnings')}</p>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={nameId}>{t('common.name')}</Label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('skills.namePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={descriptionId}>{t('common.description')}</Label>
                <Textarea
                  id={descriptionId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={tagsId}>{t('skills.tags')}</Label>
                <Input
                  id={tagsId}
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder={t('skills.tagsPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('skills.importFiles').replace('{count}', preview.files.length.toString())}
                </p>
                <ul className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm font-mono space-y-1">
                  {preview.files.map((file) => (
                    <li key={file.path}>{file.path}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!preview || !name.trim() || hasBlockingErrors || importConfirm.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            {importConfirm.isPending ? t('common.saving') : t('skills.importConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

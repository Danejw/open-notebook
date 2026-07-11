'use client'

import { useEffect, useId, useRef, useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  useImportSkillConfirmBulk,
  useImportSkillPreviewBulk,
} from '@/lib/hooks/use-skills'
import { ImportPreview } from '@/lib/types/skills'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SkillImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ReviewItem extends ImportPreview {
  key: string
  selected: boolean
  nameEdit: string
  descriptionEdit: string
  tagsInput: string
}

export function SkillImportDialog({ open, onOpenChange }: SkillImportDialogProps) {
  const { t } = useTranslation()
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importPreview = useImportSkillPreviewBulk()
  const importConfirm = useImportSkillConfirmBulk()

  const [items, setItems] = useState<ReviewItem[]>([])
  const [topErrors, setTopErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      setItems([])
      setTopErrors([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [open])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    const result = await importPreview.mutateAsync(files)
    setTopErrors(result.errors ?? [])
    setItems(
      result.items.map((item, index) => ({
        ...item,
        key: `${item.source_filename ?? 'zip'}-${item.root_name}-${index}`,
        selected: item.selected !== false && (item.errors?.length ?? 0) === 0,
        nameEdit: item.name || item.root_name || '',
        descriptionEdit: item.description || '',
        tagsInput: '',
      }))
    )
  }

  const updateItem = (key: string, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const selectedValid = items.filter(
    (item) => item.selected && item.nameEdit.trim() && (item.errors?.length ?? 0) === 0
  )

  const handleConfirm = async () => {
    if (selectedValid.length === 0) return

    await importConfirm.mutateAsync({
      items: selectedValid.map((item) => ({
        name: item.nameEdit.trim(),
        description: item.descriptionEdit.trim(),
        tags: item.tagsInput
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        files: item.files,
      })),
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
              multiple
              onChange={handleFileChange}
              disabled={importPreview.isPending}
            />
            <p className="text-xs text-muted-foreground">{t('skills.bulkImportHint')}</p>
          </div>

          {importPreview.isPending && (
            <p className="text-sm text-muted-foreground">{t('skills.importReviewing')}</p>
          )}

          {topErrors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <p className="text-sm font-medium text-destructive">{t('skills.importErrors')}</p>
              <ul className="list-disc pl-5 text-sm text-destructive space-y-1">
                {topErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">
                  {t('skills.bulkImportReview').replace('{count}', String(items.length))}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setItems((prev) =>
                      prev.map((item) => ({
                        ...item,
                        selected: (item.errors?.length ?? 0) === 0,
                      }))
                    )
                  }
                >
                  {t('skills.selectAllValid')}
                </Button>
              </div>

              {items.map((item) => {
                const hasErrors = (item.errors?.length ?? 0) > 0
                return (
                  <div key={item.key} className="space-y-3 border rounded-md p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={item.selected}
                        disabled={hasErrors}
                        onCheckedChange={(checked) =>
                          updateItem(item.key, { selected: checked === true })
                        }
                        aria-label={t('skills.includeSkill')}
                      />
                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium truncate">
                            {item.nameEdit || item.root_name}
                          </span>
                          {item.source_filename && (
                            <span className="text-muted-foreground truncate">
                              {item.source_filename}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {t('skills.importFiles').replace(
                              '{count}',
                              String(item.files.length)
                            )}
                          </span>
                        </div>

                        {hasErrors && (
                          <ul className="list-disc pl-5 text-sm text-destructive space-y-1">
                            {item.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        )}

                        {(item.warnings?.length ?? 0) > 0 && (
                          <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-400 space-y-1">
                            {item.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t('common.name')}</Label>
                            <Input
                              value={item.nameEdit}
                              onChange={(e) =>
                                updateItem(item.key, { nameEdit: e.target.value })
                              }
                              disabled={hasErrors}
                              placeholder={t('skills.namePlaceholder')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('skills.tags')}</Label>
                            <Input
                              value={item.tagsInput}
                              onChange={(e) =>
                                updateItem(item.key, { tagsInput: e.target.value })
                              }
                              disabled={hasErrors}
                              placeholder={t('skills.tagsPlaceholder')}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('common.description')}</Label>
                          <Textarea
                            value={item.descriptionEdit}
                            onChange={(e) =>
                              updateItem(item.key, { descriptionEdit: e.target.value })
                            }
                            disabled={hasErrors}
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
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
            disabled={selectedValid.length === 0 || importConfirm.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            {importConfirm.isPending
              ? t('common.saving')
              : t('skills.bulkImportConfirm').replace(
                  '{count}',
                  String(selectedValid.length)
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

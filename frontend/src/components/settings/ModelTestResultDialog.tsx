'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import { ModelTestResult } from '@/lib/types/models'

export function ModelTestResultDialog({
  open,
  onOpenChange,
  result,
  modelName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: ModelTestResult | null
  modelName: string
}) {
  const { t } = useTranslation()

  if (!result) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {result.success ? t('models.testModelSuccess') : t('models.testModelFailed')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-1 py-1">
          <p className="text-xs text-muted-foreground">{modelName}</p>
          <p className="text-sm">{result.message}</p>

          {result.details && (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-[11px]">
              {result.details}
            </pre>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

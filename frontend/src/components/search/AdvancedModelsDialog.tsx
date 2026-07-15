'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogBodyClassName,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ModelSelector } from '@/components/common/ModelSelector'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface AdvancedModelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultModels: {
    strategy: string
    answer: string
    finalAnswer: string
  }
  onSave: (models: {
    strategy: string
    answer: string
    finalAnswer: string
  }) => void
}

export function AdvancedModelsDialog({
  open,
  onOpenChange,
  defaultModels,
  onSave
}: AdvancedModelsDialogProps) {
  const { t } = useTranslation()
  const [strategyModel, setStrategyModel] = useState(defaultModels.strategy)
  const [answerModel, setAnswerModel] = useState(defaultModels.answer)
  const [finalAnswerModel, setFinalAnswerModel] = useState(defaultModels.finalAnswer)

  useEffect(() => {
    setStrategyModel(defaultModels.strategy)
    setAnswerModel(defaultModels.answer)
    setFinalAnswerModel(defaultModels.finalAnswer)
  }, [defaultModels])

  const handleSave = () => {
    onSave({
      strategy: strategyModel,
      answer: answerModel,
      finalAnswer: finalAnswerModel
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('searchPage.advancedModelTitle')}</DialogTitle>
        </DialogHeader>

        <div className={cn(dialogBodyClassName, 'space-y-3')}>
          <ModelSelector
            label={t('searchPage.strategyModel')}
            modelType="language"
            value={strategyModel}
            onChange={setStrategyModel}
            placeholder={t('searchPage.selectStrategyPlaceholder')}
          />

          <ModelSelector
            label={t('searchPage.answerModel')}
            modelType="language"
            value={answerModel}
            onChange={setAnswerModel}
            placeholder={t('searchPage.selectAnswerPlaceholder')}
          />

          <ModelSelector
            label={t('searchPage.finalAnswerModel')}
            modelType="language"
            value={finalAnswerModel}
            onChange={setFinalAnswerModel}
            placeholder={t('searchPage.selectFinalPlaceholder')}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="h-7" onClick={handleSave}>
            {t('searchPage.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

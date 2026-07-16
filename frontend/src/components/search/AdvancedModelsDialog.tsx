'use client'

import { useState } from 'react'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { ModelPickerField } from '@/components/common/ModelPickerField'
import { useTranslation } from '@/lib/hooks/use-translation'

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
  onSave,
}: AdvancedModelsDialogProps) {
  const { t } = useTranslation()
  const [strategyModel, setStrategyModel] = useState(defaultModels.strategy)
  const [answerModel, setAnswerModel] = useState(defaultModels.answer)
  const [finalAnswerModel, setFinalAnswerModel] = useState(defaultModels.finalAnswer)

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('searchPage.advancedModelTitle')}
      contentClassName="sm:max-w-md"
      compactFooter
      submitLabel={t('searchPage.saveChanges')}
      onOpen={() => {
        setStrategyModel(defaultModels.strategy)
        setAnswerModel(defaultModels.answer)
        setFinalAnswerModel(defaultModels.finalAnswer)
      }}
      onSubmit={(event) => {
        event.preventDefault()
        onSave({
          strategy: strategyModel,
          answer: answerModel,
          finalAnswer: finalAnswerModel,
        })
        onOpenChange(false)
      }}
    >
      <ModelPickerField
        label={t('searchPage.strategyModel')}
        modelType="language"
        value={strategyModel || null}
        onChange={(value) => setStrategyModel(value ?? '')}
        placeholder={t('searchPage.selectStrategyPlaceholder')}
        allowClear={false}
      />

      <ModelPickerField
        label={t('searchPage.answerModel')}
        modelType="language"
        value={answerModel || null}
        onChange={(value) => setAnswerModel(value ?? '')}
        placeholder={t('searchPage.selectAnswerPlaceholder')}
        allowClear={false}
      />

      <ModelPickerField
        label={t('searchPage.finalAnswerModel')}
        modelType="language"
        value={finalAnswerModel || null}
        onChange={(value) => setFinalAnswerModel(value ?? '')}
        placeholder={t('searchPage.selectFinalPlaceholder')}
        allowClear={false}
      />
    </FormDialogShell>
  )
}

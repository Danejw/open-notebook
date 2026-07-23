'use client'

import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface AddSourceWizardFooterProps {
  currentStep: number
  currentStepValid: boolean
  isPending: boolean
  onClose: () => void
  onPrevStep: (e?: MouseEvent) => void
  onNextStep: (e?: MouseEvent) => void
}

export function AddSourceWizardFooter({
  currentStep,
  currentStepValid,
  isPending,
  onClose,
  onPrevStep,
  onNextStep,
}: AddSourceWizardFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="flex justify-between items-center gap-[2px] p-[2px] border-t border-border bg-muted">
      <Button type="button" variant="outline" onClick={onClose}>
        {t('common.cancel')}
      </Button>

      <div className="flex gap-[2px]">
        {currentStep > 1 && (
          <Button type="button" variant="outline" onClick={onPrevStep}>
            {t('common.back')}
          </Button>
        )}

        {currentStep < 3 && (
          <Button
            type="button"
            variant="outline"
            onClick={(e) => onNextStep(e)}
            disabled={!currentStepValid}
          >
            {t('common.next')}
          </Button>
        )}

        <Button
          type="submit"
          disabled={!currentStepValid || isPending}
          className="min-w-[120px]"
        >
          {isPending ? t('common.adding') : t('common.done')}
        </Button>
      </div>
    </div>
  )
}

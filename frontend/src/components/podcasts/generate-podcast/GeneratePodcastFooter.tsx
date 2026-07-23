'use client'

import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface GeneratePodcastFooterProps {
  isSubmitting: boolean
  onSubmit: () => void
  onCancel: () => void
}

export function GeneratePodcastFooter({
  isSubmitting,
  onSubmit,
  onCancel,
}: GeneratePodcastFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={onSubmit} disabled={isSubmitting} className="w-full">
        {isSubmitting && <InlineSkeleton className="mr-2" />}
        {isSubmitting ? t('podcasts.generating') : t('podcasts.generate')}
      </Button>
      <Button
        variant="outline"
        onClick={onCancel}
        disabled={isSubmitting}
        className="w-full"
      >
        {t('common.cancel')}
      </Button>
    </div>
  )
}

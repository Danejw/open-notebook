'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

interface PageRefreshButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function PageRefreshButton({ onClick, disabled }: PageRefreshButtonProps) {
  const { t } = useTranslation()

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 w-7 p-0"
      onClick={onClick}
      disabled={disabled}
      aria-label={t('common.refresh')}
    >
      <RefreshCw className="h-3.5 w-3.5" />
    </Button>
  )
}

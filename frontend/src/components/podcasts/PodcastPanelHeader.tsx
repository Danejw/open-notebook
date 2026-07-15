'use client'

import { Button } from '@/components/ui/button'

interface PodcastPanelHeaderProps {
  title: string
  description: string
  buttonLabel: string
  onCreate: () => void
  disabled?: boolean
}

export function PodcastPanelHeader({
  title,
  description,
  buttonLabel,
  onCreate,
  disabled,
}: PodcastPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-snug">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        size="sm"
        className="h-7 shrink-0 text-xs"
        onClick={onCreate}
        disabled={disabled}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}

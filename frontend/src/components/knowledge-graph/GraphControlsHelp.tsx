'use client'

import { useState, type ReactNode } from 'react'
import {
  ChevronUp,
  CircleHelp,
  Maximize2,
  MousePointerClick,
  Move,
  RotateCw,
  ZoomIn,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface ControlRow {
  icon: ReactNode
  gestureKey: string
  actionKey: string
}

const ROWS: ControlRow[] = [
  {
    icon: <RotateCw className="size-3.5 shrink-0 text-muted-foreground" />,
    gestureKey: 'knowledge.graphControlRotateGesture',
    actionKey: 'knowledge.graphControlRotate',
  },
  {
    icon: <ZoomIn className="size-3.5 shrink-0 text-muted-foreground" />,
    gestureKey: 'knowledge.graphControlZoomGesture',
    actionKey: 'knowledge.graphControlZoom',
  },
  {
    icon: (
      <MousePointerClick className="size-3.5 shrink-0 text-muted-foreground" />
    ),
    gestureKey: 'knowledge.graphControlSelectGesture',
    actionKey: 'knowledge.graphControlSelect',
  },
  {
    icon: <Move className="size-3.5 shrink-0 text-muted-foreground" />,
    gestureKey: 'knowledge.graphControlPanGesture',
    actionKey: 'knowledge.graphControlPan',
  },
  {
    icon: <Maximize2 className="size-3.5 shrink-0 text-muted-foreground" />,
    gestureKey: 'knowledge.graphControlFitResetGesture',
    actionKey: 'knowledge.graphControlToolbar',
  },
]

interface GraphControlsHelpProps {
  className?: string
}

/**
 * Compact HUD chip listing camera / selection gestures.
 * Collapsed by default so it does not steal canvas space.
 */
export function GraphControlsHelp({ className }: GraphControlsHelpProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const label = t('knowledge.graphControls')

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-0 left-0 z-20 p-0.5',
        className
      )}
      data-testid="knowledge-graph-controls-help"
    >
      <div className="pointer-events-auto">
        {open ? (
          <div className="w-[min(100%,13.5rem)] overflow-hidden rounded-md border bg-background/90 shadow-md backdrop-blur-sm">
            <div className="flex items-center gap-0.5 border-b px-0.5 py-0.5">
              <CircleHelp className="ml-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate px-0.5 text-[11px] font-medium">
                {label}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-expanded
                aria-label={label}
                onClick={() => setOpen(false)}
              >
                <ChevronUp className="size-3.5" />
              </Button>
            </div>
            <ul className="flex flex-col gap-0.5 p-0.5">
              {ROWS.map((row) => (
                <li
                  key={row.gestureKey}
                  className="flex items-center gap-1 px-0.5 py-0.5 text-[11px] leading-tight"
                >
                  {row.icon}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {t(row.gestureKey)}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {t(row.actionKey)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-7 border bg-background/80 shadow-sm backdrop-blur-sm"
            aria-expanded={false}
            aria-label={label}
            onClick={() => setOpen(true)}
          >
            <CircleHelp className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

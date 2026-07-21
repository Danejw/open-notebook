'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface GraphScaleToolProps {
  label: string
  lowLabel: string
  highLabel: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Highlight trigger when value differs from the default. */
  active?: boolean
  compact?: boolean
  icon: ReactNode
}

/**
 * Toolbar popover with a percentage scale slider (node size, edge opacity, etc.).
 */
export function GraphScaleTool({
  label,
  lowLabel,
  highLabel,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  active = false,
  compact = false,
  icon,
}: GraphScaleToolProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant={active ? 'secondary' : 'ghost'}
              className={cn('shrink-0', compact ? 'size-6' : 'size-7')}
              aria-label={label}
            >
              {icon}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-52 p-1.5">
        <div className="flex items-center justify-between gap-0.5 pb-1">
          <span className="text-[11px] font-medium">{label}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {Math.round(value * 100)}%
          </span>
        </div>
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          aria-label={label}
          onValueChange={(values) => {
            const next = values[0]
            if (typeof next === 'number') onChange(next)
          }}
        />
        <div className="flex justify-between pt-0.5 text-[11px] text-muted-foreground">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

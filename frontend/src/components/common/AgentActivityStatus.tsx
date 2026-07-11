'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentActivityStatusProps {
  streamStatus?: string | null
  activityLog?: string[]
  className?: string
}

/**
 * Live agent status + compact completed-step log for the current turn.
 */
export function AgentActivityStatus({
  streamStatus,
  activityLog = [],
  className,
}: AgentActivityStatusProps) {
  if (!streamStatus && activityLog.length === 0) {
    return null
  }

  return (
    <div className={cn('flex justify-start', className)}>
      <div className="max-w-[90%] space-y-1.5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        {activityLog.length > 0 && (
          <ul className="space-y-0.5 text-[12px] leading-snug">
            {activityLog.map((line, index) => (
              <li key={`${index}-${line}`} className="flex gap-1.5">
                <span className="text-muted-foreground/70" aria-hidden>
                  ✓
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        {streamStatus ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span>{streamStatus}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

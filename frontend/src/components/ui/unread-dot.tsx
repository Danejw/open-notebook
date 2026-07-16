import { cn } from '@/lib/utils'

interface UnreadDotProps {
  className?: string
  /** Accessible label for screen readers when the dot conveys status. */
  label?: string
}

/**
 * Small theme-primary indicator for unseen/unread UI affordances.
 */
export function UnreadDot({ className, label }: UnreadDotProps) {
  return (
    <span
      data-slot="unread-dot"
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full bg-primary',
        className
      )}
    />
  )
}

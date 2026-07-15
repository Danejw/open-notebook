import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('rounded-md border border-dashed px-3 py-6 text-center', className)}>
      <Icon className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      {description && <p className="mb-3 text-xs text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}

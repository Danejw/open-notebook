import { AlertCircle, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface PageErrorProps {
  title: string
  description?: string
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  icon?: LucideIcon
  tone?: 'destructive' | 'muted'
  centered?: boolean
}

export function PageError({
  title,
  description,
  action,
  children,
  className,
  icon: Icon = AlertCircle,
  tone = 'destructive',
  centered = false,
}: PageErrorProps) {
  if (tone === 'muted') {
    return (
      <div
        className={cn(
          centered && 'text-center',
          'text-muted-foreground',
          className
        )}
      >
        <Icon className={cn('opacity-50', centered ? 'mx-auto mb-4 h-12 w-12' : 'mb-2 h-5 w-5')} />
        <p className="text-sm">{title}</p>
        {description && <p className="mt-2 text-xs">{description}</p>}
        {children}
        {action && <div className={cn(centered ? 'mt-4' : 'mt-3')}>{action}</div>}
      </div>
    )
  }

  return (
    <div
      className={cn(
        centered && 'flex flex-col items-center text-center',
        className
      )}
    >
      <Alert variant="destructive" className={cn(centered && 'max-w-md')}>
        <Icon />
        <AlertTitle>{title}</AlertTitle>
        {description && <AlertDescription>{description}</AlertDescription>}
      </Alert>
      {children}
      {action && <div className={cn(centered ? 'mt-4' : 'mt-3')}>{action}</div>}
    </div>
  )
}

interface InlineErrorProps {
  title: string
  className?: string
  icon?: LucideIcon
}

export function InlineError({
  title,
  className,
  icon: Icon = AlertCircle,
}: InlineErrorProps) {
  return (
    <div className={cn('flex items-start gap-2 text-sm text-destructive', className)}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1">{title}</div>
    </div>
  )
}

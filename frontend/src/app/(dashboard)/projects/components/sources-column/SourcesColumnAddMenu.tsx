'use client'

import { ChevronDown, Link2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  columnHeaderIconButtonClassName,
  columnHeaderIconClassName,
  columnHeaderPrimaryButtonClassName,
} from '@/components/projects/ColumnHeader'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export interface SourcesColumnAddMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddSource: () => void
  onAddExisting: () => void
  /** Compact icon trigger for graph header. */
  variant?: 'primary' | 'icon'
}

export function SourcesColumnAddMenu({
  open,
  onOpenChange,
  onAddSource,
  onAddExisting,
  variant = 'primary',
}: SourcesColumnAddMenuProps) {
  const { t } = useTranslation()

  const menuItems = (
    <>
      <DropdownMenuItem
        onClick={() => {
          onOpenChange(false)
          onAddSource()
        }}
      >
        <Plus className="h-4 w-4 mr-2" />
        {t('sources.addSource')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          onOpenChange(false)
          onAddExisting()
        }}
      >
        <Link2 className="h-4 w-4 mr-2" />
        {t('sources.addExistingTitle')}
      </DropdownMenuItem>
    </>
  )

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className={cn(
              columnHeaderIconButtonClassName,
              'border bg-background/80 shadow-sm backdrop-blur-sm'
            )}
            aria-label={t('sources.addSource')}
            title={t('sources.addSource')}
          >
            <Plus className={columnHeaderIconClassName} />
          </Button>
        ) : (
          <Button size="sm" className={columnHeaderPrimaryButtonClassName}>
            <Plus className={columnHeaderIconClassName} />
            {t('sources.addSource')}
            <ChevronDown className={columnHeaderIconClassName} />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
    </DropdownMenu>
  )
}

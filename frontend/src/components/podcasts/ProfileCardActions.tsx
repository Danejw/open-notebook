'use client'

import { Copy, Edit3, MoreVertical, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ProfileCardActionsProps {
  onEdit: () => void
  onDuplicate: () => void
  onRequestDelete: () => void
  deleteDisabled?: boolean
  isDuplicating?: boolean
}

export function ProfileCardActions({
  onEdit,
  onDuplicate,
  onRequestDelete,
  deleteDisabled,
  isDuplicating,
}: ProfileCardActionsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Edit3 className="mr-2 h-4 w-4" /> {t('podcasts.edit')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem onClick={onDuplicate} disabled={isDuplicating}>
            <Copy className="h-4 w-4 mr-2" />
            {t('podcasts.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={deleteDisabled}
            onClick={onRequestDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('podcasts.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { Archive, Library } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Collection } from '@/lib/types/collections'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useSelectableRow } from '@/lib/hooks/useSelectableRow'
import { shouldShowCollectionStatus } from './collection-status'
import {
  CompactListRowContent,
  CompactListRowIcon,
  CompactListRowMeta,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from '@/components/common/CompactListRow'
import { cn } from '@/lib/utils'

interface CollectionCardProps {
  collection: Collection
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: (collectionId: string) => void
  onEnterSelection?: (collectionId: string) => void
}

export function CollectionCard({
  collection,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: CollectionCardProps) {
  const { t } = useTranslation()
  const router = useRouter()

  const metaParts: string[] = []
  if (shouldShowCollectionStatus(collection.status)) {
    metaParts.push(collection.status)
  }
  metaParts.push(
    t('collections.itemCount').replace('{count}', collection.item_count.toString())
  )
  if (collection.updated) {
    metaParts.push(new Date(collection.updated).toLocaleDateString())
  }

  const { rowProps, selectedClassName } = useSelectableRow({
    selectionMode,
    selected,
    onToggleSelect: () => onToggleSelect?.(collection.id),
    onEnterSelection: onEnterSelection
      ? () => onEnterSelection(collection.id)
      : undefined,
    onActivate: () => router.push(`/collections/${collection.id}`),
    longPressDisabled: !onEnterSelection && !selectionMode,
  })

  return (
    <div
      {...rowProps}
      className={cn(
        'group flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-muted/40',
        selectedClassName
      )}
    >
      {selectionMode ? (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect?.(collection.id)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
          aria-label={collection.name}
        />
      ) : (
        <CompactListRowIcon>
          <Library aria-hidden />
        </CompactListRowIcon>
      )}
      <CompactListRowContent>
        <CompactListRowTitleRow className="gap-2">
          <CompactListRowTitle>{collection.name}</CompactListRowTitle>
          {collection.archived ? (
            <Badge variant="outline" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
              <Archive className="h-3 w-3" />
              {t('collections.archived')}
            </Badge>
          ) : null}
        </CompactListRowTitleRow>
        <CompactListRowMeta>
          {collection.description ? (
            <>
              <span>{collection.description}</span>
              <span aria-hidden> · </span>
            </>
          ) : null}
          {metaParts.join(' · ')}
        </CompactListRowMeta>
      </CompactListRowContent>
    </div>
  )
}

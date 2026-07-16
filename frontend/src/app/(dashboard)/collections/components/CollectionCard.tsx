'use client'

import { Archive, Library } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collection } from '@/lib/types/collections'
import { useTranslation } from '@/lib/hooks/use-translation'
import { shouldShowCollectionStatus } from './collection-status'
import {
  CompactListRow,
  CompactListRowContent,
  CompactListRowIcon,
  CompactListRowMeta,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from '@/components/common/CompactListRow'

interface CollectionCardProps {
  collection: Collection
  /** When true, row is not a navigation link (bulk selection). */
  selectionMode?: boolean
  onSelectToggle?: () => void
}

export function CollectionCard({
  collection,
  selectionMode = false,
  onSelectToggle,
}: CollectionCardProps) {
  const { t } = useTranslation()

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

  return (
    <CompactListRow
      href={selectionMode ? undefined : `/collections/${collection.id}`}
      onClick={selectionMode ? () => onSelectToggle?.() : undefined}
    >
      <CompactListRowIcon>
        <Library aria-hidden />
      </CompactListRowIcon>
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
    </CompactListRow>
  )
}

'use client'

import { memo } from 'react'
import { Link as LinkIcon, Upload, AlignLeft, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SourceListResponse } from '@/lib/types/api'
import { cn } from '@/lib/utils'
import type { Locale } from 'date-fns'

export interface SourcesTableRowProps {
  source: SourceListResponse
  index: number
  isSelected: boolean
  dateLocale: Locale
  typeLinkLabel: string
  typeFileLabel: string
  typeTextLabel: string
  untitledLabel: string
  yesLabel: string
  noLabel: string
  onRowClick: (index: number, sourceId: string) => void
  onMouseEnter: (index: number) => void
  onDeleteClick: (e: React.MouseEvent, source: SourceListResponse) => void
  measureRef?: (node: HTMLTableRowElement | null) => void
  dataIndex?: number
}

function SourcesTableRowImpl({
  source,
  index,
  isSelected,
  dateLocale,
  typeLinkLabel,
  typeFileLabel,
  typeTextLabel,
  untitledLabel,
  yesLabel,
  noLabel,
  onRowClick,
  onMouseEnter,
  onDeleteClick,
  measureRef,
  dataIndex,
}: SourcesTableRowProps) {
  const icon =
    source.asset?.url ? (
      <LinkIcon className="h-4 w-4" />
    ) : source.asset?.file_path ? (
      <Upload className="h-4 w-4" />
    ) : (
      <AlignLeft className="h-4 w-4" />
    )

  const typeLabel = source.asset?.url
    ? typeLinkLabel
    : source.asset?.file_path
      ? typeFileLabel
      : typeTextLabel

  return (
    <tr
      ref={measureRef}
      data-index={dataIndex ?? index}
      data-source-row
      onClick={() => onRowClick(index, source.id)}
      onMouseEnter={() => onMouseEnter(index)}
      className={cn(
        'cursor-pointer border-b transition-colors',
        isSelected ? 'bg-accent' : 'hover:bg-muted/50'
      )}
    >
      <td className="h-12 px-4">
        <div className="flex items-center gap-2">
          {icon}
          <Badge variant="secondary" className="text-xs">
            {typeLabel}
          </Badge>
        </div>
      </td>
      <td className="h-12 px-4">
        <div className="flex flex-col overflow-hidden">
          <span className="truncate font-medium">{source.title || untitledLabel}</span>
          {source.asset?.url && (
            <span className="truncate text-xs text-muted-foreground">{source.asset.url}</span>
          )}
        </div>
      </td>
      <td className="hidden h-12 px-4 text-sm text-muted-foreground sm:table-cell">
        {formatDistanceToNow(new Date(source.created), {
          addSuffix: true,
          locale: dateLocale,
        })}
      </td>
      <td className="hidden h-12 px-4 text-center md:table-cell">
        <span className="text-sm font-medium">{source.insights_count || 0}</span>
      </td>
      <td className="hidden h-12 px-4 text-center lg:table-cell">
        <Badge variant={source.embedded ? 'default' : 'secondary'} className="text-xs">
          {source.embedded ? yesLabel : noLabel}
        </Badge>
      </td>
      <td className="h-12 px-4 text-right">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => onDeleteClick(e, source)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  )
}

function areEqual(prev: SourcesTableRowProps, next: SourcesTableRowProps) {
  return (
    prev.source.id === next.source.id &&
    prev.source.title === next.source.title &&
    prev.source.updated === next.source.updated &&
    prev.source.embedded === next.source.embedded &&
    prev.source.insights_count === next.source.insights_count &&
    prev.isSelected === next.isSelected &&
    prev.index === next.index
  )
}

export const SourcesTableRow = memo(SourcesTableRowImpl, areEqual)

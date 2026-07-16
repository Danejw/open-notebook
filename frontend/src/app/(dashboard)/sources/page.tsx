'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SourceListResponse } from '@/lib/types/api'
import { TableLoadMoreSkeleton } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { PageError } from '@/components/common/PageError'
import { SourcesTableSkeleton } from '@/components/layout/SourcesTableSkeleton'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SourcesTableRow } from '@/components/sources/SourcesTableRow'
import { FileText, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'
import { cn } from '@/lib/utils'
import {
  useAllSourcesInfinite,
  useDeleteSource,
  type SourcesSortBy,
  type SourcesSortOrder,
} from '@/lib/hooks/use-sources'

const VIRTUALIZE_THRESHOLD = 50
const ROW_HEIGHT_ESTIMATE = 36

export default function SourcesPage() {
  const { t, language } = useTranslation()
  const deleteSource = useDeleteSource()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [sortBy, setSortBy] = useState<SourcesSortBy>('updated')
  const [sortOrder, setSortOrder] = useState<SourcesSortOrder>('desc')
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; source: SourceListResponse | null }>({
    open: false,
    source: null,
  })
  const router = useRouter()
  const tableRef = useRef<HTMLTableElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const {
    sources,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useAllSourcesInfinite(sortBy, sortOrder)

  const useVirtual = sources.length >= VIRTUALIZE_THRESHOLD
  const dateLocale = useMemo(() => getDateLocale(language), [language])

  const rowVirtualizer = useVirtualizer({
    count: sources.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 12,
    enabled: useVirtual,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const paddingTop = useVirtual && virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    useVirtual && virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  const rowLabels = useMemo(
    () => ({
      typeLinkLabel: t('sources.type.link'),
      typeFileLabel: t('sources.type.file'),
      typeTextLabel: t('sources.type.text'),
      untitledLabel: t('sources.untitledSource'),
      yesLabel: t('sources.yes'),
      noLabel: t('sources.no'),
      deleteLabel: t('sources.deleteSource'),
    }),
    [t]
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [sortBy, sortOrder])

  useEffect(() => {
    if (sources.length > 0 && tableRef.current) {
      tableRef.current.focus()
    }
  }, [sources.length])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sources.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => {
            const newIndex = Math.min(prev + 1, sources.length - 1)
            setTimeout(() => scrollToSelectedRow(newIndex), 0)
            return newIndex
          })
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => {
            const newIndex = Math.max(prev - 1, 0)
            setTimeout(() => scrollToSelectedRow(newIndex), 0)
            return newIndex
          })
          break
        case 'Enter':
          e.preventDefault()
          if (sources[selectedIndex]) {
            router.push(`/sources/${sources[selectedIndex].id}`)
          }
          break
        case 'Home':
          e.preventDefault()
          setSelectedIndex(0)
          setTimeout(() => scrollToSelectedRow(0), 0)
          break
        case 'End':
          e.preventDefault()
          setSelectedIndex(sources.length - 1)
          setTimeout(() => scrollToSelectedRow(sources.length - 1), 0)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sources, selectedIndex, router, useVirtual, rowVirtualizer])

  const scrollToSelectedRow = (index: number) => {
    if (useVirtual) {
      rowVirtualizer.scrollToIndex(index, { align: 'auto' })
      return
    }

    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const rows = scrollContainer.querySelectorAll('tbody tr[data-source-row]')
    const selectedRow = rows[index] as HTMLElement
    if (!selectedRow) return

    const containerRect = scrollContainer.getBoundingClientRect()
    const rowRect = selectedRow.getBoundingClientRect()

    if (rowRect.top < containerRect.top) {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (rowRect.bottom > containerRect.bottom) {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    let scrollTimeout: ReturnType<typeof setTimeout> | null = null

    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout)

      scrollTimeout = setTimeout(() => {
        if (!scrollContainerRef.current) return

        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight

        if (distanceFromBottom < 200 && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      }, 100)
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    handleScroll()

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, sources.length])

  const toggleSort = (field: SourcesSortBy) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const handleRowClick = useCallback((index: number, sourceId: string) => {
    setSelectedIndex(index)
    router.push(`/sources/${sourceId}`)
  }, [router])

  const handleDeleteClick = useCallback((e: React.MouseEvent, source: SourceListResponse) => {
    e.stopPropagation()
    setDeleteDialog({ open: true, source })
  }, [])

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.source) return
    await deleteSource.mutateAsync(deleteDialog.source.id)
    setDeleteDialog({ open: false, source: null })
  }

  const renderSourceRow = (source: SourceListResponse, index: number) => (
    <SourcesTableRow
      key={source.id}
      source={source}
      index={index}
      isSelected={selectedIndex === index}
      dateLocale={dateLocale}
      onRowClick={handleRowClick}
      onMouseEnter={setSelectedIndex}
      onDeleteClick={handleDeleteClick}
      {...rowLabels}
    />
  )

  const showInitialSkeleton = isLoading && sources.length === 0

  if (showInitialSkeleton) {
    return (
      <div className={cn('flex h-full w-full max-w-none flex-col', pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('sources.allSources')}
        />
        <SourcesTableSkeleton />
      </div>
    )
  }

  if (error && sources.length === 0) {
    return (
      <div className={cn('flex h-full w-full max-w-none flex-col', pageContentClassName, pageSectionGapClassName)}>
        <PageHeader title={t('sources.allSources')} />
        <div className="flex flex-1 items-center justify-center">
          <PageError title={t('sources.failedToLoad')} centered />
        </div>
      </div>
    )
  }

  if (!isLoading && sources.length === 0) {
    return (
      <div className={cn('flex h-full w-full max-w-none flex-col', pageContentClassName, pageSectionGapClassName)}>
        <PageHeader title={t('sources.allSources')} />
        <EmptyState
          icon={FileText}
          title={t('sources.noSourcesYet')}
          description={t('sources.allSourcesDescShort')}
        />
      </div>
    )
  }

  return (
    <>
      <div className={cn('flex h-full w-full max-w-none flex-col', pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('sources.allSources')}
        />

        <div ref={scrollContainerRef} className="flex-1 overflow-auto rounded-md border">
          <table
            ref={tableRef}
            tabIndex={0}
            className="w-full min-w-[800px] table-fixed outline-none"
          >
            <colgroup>
              <col className="w-[120px]" />
              <col className="w-auto" />
              <col className="w-[140px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b bg-muted/50">
                <th className="h-8 px-3 text-left align-middle text-xs font-medium text-muted-foreground">
                  {t('common.type')}
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium text-muted-foreground">
                  {t('common.title')}
                </th>
                <th className="hidden h-8 px-3 text-left align-middle text-xs font-medium text-muted-foreground sm:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('created')}
                    className="h-7 px-1.5 text-xs hover:bg-muted"
                  >
                    {t('common.created_label')}
                    <ArrowUpDown
                      className={cn(
                        'ml-1.5 h-3 w-3',
                        sortBy === 'created' ? 'opacity-100' : 'opacity-30'
                      )}
                    />
                    {sortBy === 'created' && (
                      <span className="ml-1 text-[11px]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </Button>
                </th>
                <th className="hidden h-8 px-3 text-center align-middle text-xs font-medium text-muted-foreground lg:table-cell">
                  {t('sources.embedded')}
                </th>
                <th className="h-8 px-3 text-right align-middle text-xs font-medium text-muted-foreground">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {useVirtual && paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={5} style={{ height: paddingTop, padding: 0, border: 0 }} />
                </tr>
              )}
              {useVirtual
                ? virtualRows.map((virtualRow) => {
                    const source = sources[virtualRow.index]
                    return (
                      <SourcesTableRow
                        key={source.id}
                        source={source}
                        index={virtualRow.index}
                        isSelected={selectedIndex === virtualRow.index}
                        dateLocale={dateLocale}
                        onRowClick={handleRowClick}
                        onMouseEnter={setSelectedIndex}
                        onDeleteClick={handleDeleteClick}
                        measureRef={rowVirtualizer.measureElement}
                        dataIndex={virtualRow.index}
                        {...rowLabels}
                      />
                    )
                  })
                : sources.map((source, index) => renderSourceRow(source, index))}
              {useVirtual && paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={5} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                </tr>
              )}
              {isFetchingNextPage && (
                <tr>
                  <td colSpan={5}>
                    <TableLoadMoreSkeleton />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, source: deleteDialog.source })}
        title={t('sources.delete')}
        description={t('sources.deleteConfirmWithTitle').replace(
          '{title}',
          deleteDialog.source?.title || t('sources.untitledSource')
        )}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Inbox, Link2, RefreshCw } from 'lucide-react'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'

import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useIsMobile, useIsTablet } from '@/lib/hooks/use-media-query'
import { useCollectionsCatalog } from '@/lib/hooks/use-collections'
import {
  useImportSamGovOpportunityUrl,
  useOpportunities,
  useOpportunityDashboard,
  useOpportunitySources,
  useSeedOpportunitySources,
  useSetSamSyncCollection,
  useSyncSamGovOpportunities,
} from '@/lib/hooks/use-opportunities'
import type {
  HawaiiIsland,
  OpportunityFilters,
  OpportunitySort,
} from '@/lib/types/opportunities'
import { cn } from '@/lib/utils'
import { ImportSamUrlDialog } from '@/app/(dashboard)/opportunities/components/ImportSamUrlDialog'
import { OverviewMetric } from '@/app/(dashboard)/opportunities/components/OverviewMetric'
import {
  OpportunityDetailsPanel,
  OpportunityListPanel,
} from '@/app/(dashboard)/opportunities/components/OpportunityListPanel'
import {
  formatMoney,
  isSourceStage,
  type InboxFilter,
} from '@/app/(dashboard)/opportunities/components/opportunityUtils'

const OPPORTUNITY_LAYOUT_STORAGE =
  typeof window === 'undefined'
    ? { getItem: () => null, setItem: () => {} }
    : localStorage

export default function OpportunitiesPage() {
  const [query, setQuery] = useState('')
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all')
  const [island, setIsland] = useState<HawaiiIsland | 'all'>('all')
  const [sourceKey, setSourceKey] = useState('all')
  const [sort, setSort] = useState<OpportunitySort>('due')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [syncCollectionId, setSyncCollectionId] = useState<string>('none')
  const [syncCollectionHydrated, setSyncCollectionHydrated] = useState(false)
  const [importUrlOpen, setImportUrlOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const detailsRef = useRef<HTMLElement | null>(null)
  const listPanelRef = usePanelRef()
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'opportunity-hub-columns',
    panelIds: ['list', 'details'],
    storage: OPPORTUNITY_LAYOUT_STORAGE,
    onlySaveAfterUserInteractions: true,
  })

  const handleListPanelResize = () => {
    const isCollapsed = listPanelRef.current?.isCollapsed() ?? false
    setListCollapsed((prev) => (prev !== isCollapsed ? isCollapsed : prev))
  }

  useEffect(() => {
    if (isMobile) return
    const frame = requestAnimationFrame(() => {
      setListCollapsed(listPanelRef.current?.isCollapsed() ?? false)
    })
    return () => cancelAnimationFrame(frame)
  }, [isMobile, defaultLayout, isTablet])

  useEffect(() => {
    if (!isTablet) return
    const panel = listPanelRef.current
    if (!panel) return
    const frame = requestAnimationFrame(() => {
      if (!panel.isCollapsed()) {
        panel.collapse()
      }
      setListCollapsed(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [isTablet, defaultLayout])

  const selectOpportunity = (id: string) => {
    setSelectedId(id)
    if (isMobile) {
      requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const filters: OpportunityFilters = useMemo(() => {
    const next: OpportunityFilters = {
      q: query.trim() || undefined,
      island,
      source_key: sourceKey,
      sort,
    }
    if (inboxFilter !== 'all') {
      if (isSourceStage(inboxFilter)) {
        next.source_stage = inboxFilter
      } else {
        next.status = inboxFilter
      }
    }
    return next
  }, [query, inboxFilter, island, sourceKey, sort])

  const { data, isLoading } = useOpportunities(filters)
  const { data: dashboard } = useOpportunityDashboard()
  const { data: sources, isLoading: sourcesLoading } = useOpportunitySources()
  const { data: collectionsCatalog } = useCollectionsCatalog()
  const seedSources = useSeedOpportunitySources()
  const syncSamGov = useSyncSamGovOpportunities()
  const importSamGovUrl = useImportSamGovOpportunityUrl()
  const setSamSyncCollection = useSetSamSyncCollection()

  const syncCollections = useMemo(
    () =>
      (collectionsCatalog ?? []).filter(
        (collection) => !collection.archived && collection.status !== 'archived'
      ),
    [collectionsCatalog]
  )

  const handleImportSamUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = importUrl.trim()
    if (!url || importSamGovUrl.isPending) {
      return
    }
    try {
      const result = await importSamGovUrl.mutateAsync(url)
      setImportUrlOpen(false)
      setImportUrl('')
      selectOpportunity(result.opportunity.id)
    } catch {
      // Toast handled by the mutation hook.
    }
  }

  useEffect(() => {
    if (syncCollectionHydrated || !sources) return
    const samSource = sources.find((source) => source.key === 'sam_gov_hawaii')
    const savedId = samSource?.sync_collection_id?.trim()
    if (savedId) {
      setSyncCollectionId(savedId)
    }
    setSyncCollectionHydrated(true)
  }, [sources, syncCollectionHydrated])

  useEffect(() => {
    if (!syncCollectionHydrated || syncCollectionId === 'none') return
    if (collectionsCatalog === undefined) return
    const stillExists = syncCollections.some(
      (collection) => collection.id === syncCollectionId
    )
    if (!stillExists) {
      setSyncCollectionId('none')
    }
  }, [
    collectionsCatalog,
    syncCollectionHydrated,
    syncCollectionId,
    syncCollections,
  ])

  const handleSyncCollectionChange = (value: string) => {
    setSyncCollectionId(value)
    setSamSyncCollection.mutate(value === 'none' ? null : value)
  }

  const runSamGovSync = () => {
    syncSamGov.mutate({
      daysBack: 14,
      collectionId: syncCollectionId === 'none' ? null : syncCollectionId,
    })
  }

  useEffect(() => {
    if (!sourcesLoading && sources && sources.length === 0 && !seedSources.isPending) {
      seedSources.mutate()
    }
  }, [seedSources, sources, sourcesLoading])

  const opportunities = data?.items ?? []
  const selected =
    opportunities.find((opportunity) => opportunity.id === selectedId) ??
    opportunities[0] ??
    null

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id)
    }
    if (!selected && selectedId) {
      setSelectedId(null)
    }
  }, [selected, selectedId])

  const filtersActive =
    query.trim().length > 0 ||
    inboxFilter !== 'all' ||
    island !== 'all' ||
    sourceKey !== 'all' ||
    sort !== 'due'

  const clearFilters = () => {
    setQuery('')
    setInboxFilter('all')
    setIsland('all')
    setSourceKey('all')
    setSort('due')
  }

  const progressiveFilters = !isMobile
  const filterBarProps = {
    query,
    onQueryChange: setQuery,
    inboxFilter,
    onInboxFilterChange: setInboxFilter,
    island,
    onIslandChange: setIsland,
    sourceKey,
    onSourceKeyChange: setSourceKey,
    sort,
    onSortChange: setSort,
    sources,
    total: data?.total ?? 0,
    filtersActive,
    onClearFilters: clearFilters,
    progressiveFilters,
  }

  const listPanel = (
    <OpportunityListPanel
      opportunities={opportunities}
      selected={selected}
      isLoading={isLoading}
      total={data?.total ?? 0}
      filtersActive={filtersActive}
      collapsed={listCollapsed && !isMobile}
      filterBarProps={filterBarProps}
      onSelect={selectOpportunity}
      onClearFilters={clearFilters}
      onSyncSamGov={runSamGovSync}
      onOpenImportUrl={() => setImportUrlOpen(true)}
      syncPending={syncSamGov.isPending}
    />
  )

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        pageContentClassName
      )}
    >
      <PageHeader
        className="shrink-0"
        title="Opportunity Hub"
        icon={Inbox}
        actions={
          <div className="flex items-center gap-1.5">
            <Select
              value={syncCollectionId}
              onValueChange={handleSyncCollectionChange}
              disabled={syncSamGov.isPending || setSamSyncCollection.isPending}
            >
              <SelectTrigger
                size="sm"
                className="h-7 max-w-[11rem] text-xs"
                aria-label="Collection filter for SAM.gov sync"
              >
                <SelectValue placeholder="No collection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No collection</SelectItem>
                {syncCollections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setImportUrlOpen(true)}
              aria-label="Add SAM.gov opportunity by URL"
            >
              <Link2 className="size-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Add SAM.gov link</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={syncSamGov.isPending}
              onClick={runSamGovSync}
              aria-label="Sync SAM.gov opportunities"
            >
              <RefreshCw
                className={cn(
                  'size-3.5 sm:mr-1.5',
                  syncSamGov.isPending && 'animate-spin'
                )}
              />
              <span className="hidden sm:inline">
                {syncSamGov.isPending ? 'Syncing SAM.gov…' : 'Sync SAM.gov'}
              </span>
            </Button>
          </div>
        }
      />

      <ImportSamUrlDialog
        open={importUrlOpen}
        onOpenChange={setImportUrlOpen}
        importUrl={importUrl}
        onImportUrlChange={setImportUrl}
        onSubmit={handleImportSamUrl}
        isSubmitting={importSamGovUrl.isPending}
      />

      <section aria-label="Overview" className="mt-2 shrink-0 rounded-md border bg-card">
        <div className="flex divide-x divide-border overflow-x-auto lg:grid lg:grid-cols-6 lg:overflow-visible">
          <OverviewMetric label="New" value={dashboard?.new ?? 0} />
          <OverviewMetric label="High-fit" value={dashboard?.high_fit ?? 0} />
          <OverviewMetric
            label="Due 7d"
            value={dashboard?.due_soon ?? 0}
            warning={(dashboard?.due_soon ?? 0) > 0}
          />
          <OverviewMetric label="In progress" value={dashboard?.pursuing ?? 0} />
          <OverviewMetric label="Submitted" value={dashboard?.submitted ?? 0} />
          <OverviewMetric
            label="Pipeline"
            value={formatMoney(dashboard?.pipeline_value_max ?? 0)}
          />
        </div>
      </section>

      {!isMobile ? (
        <div className="mt-2 min-h-0 flex-1 overflow-hidden">
          <ResizablePanelGroup
            id="opportunity-hub-columns"
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="h-full min-h-0"
          >
            <ResizablePanel
              id="list"
              panelRef={listPanelRef}
              defaultSize="33%"
              minSize="20%"
              collapsible
              collapsedSize={48}
              onResize={handleListPanelResize}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <section
                aria-label="Opportunity list"
                className="@container flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card"
              >
                {listPanel}
              </section>
            </ResizablePanel>

            <ResizableHandle
              withHandle
              className="mx-0.5 w-1 rounded-full bg-transparent hover:bg-border/60"
            />

            <ResizablePanel
              id="details"
              defaultSize="67%"
              minSize="30%"
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <section
                aria-label="Opportunity details"
                className="@container flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card"
              >
                <OpportunityDetailsPanel selected={selected} />
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <section
            aria-label="Opportunity list"
            className="@container flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-md border bg-card"
          >
            <OpportunityListPanel
              opportunities={opportunities}
              selected={selected}
              isLoading={isLoading}
              total={data?.total ?? 0}
              filtersActive={filtersActive}
              collapsed={false}
              filterBarProps={filterBarProps}
              onSelect={selectOpportunity}
              onClearFilters={clearFilters}
              onSyncSamGov={runSamGovSync}
              onOpenImportUrl={() => setImportUrlOpen(true)}
              syncPending={syncSamGov.isPending}
            />
          </section>
          <section
            ref={detailsRef}
            aria-label="Opportunity details"
            className="@container flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-md border bg-card"
          >
            <OpportunityDetailsPanel selected={selected} />
          </section>
        </div>
      )}
    </div>
  )
}

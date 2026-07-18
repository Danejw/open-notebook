'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Library, RefreshCw, SearchCheck } from 'lucide-react'

import {
  PageHeader,
  pageContentClassName,
  pageSectionGapClassName,
} from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useOpportunityNaicsCollections,
  useSyncSamGovOpportunities,
} from '@/lib/hooks/use-opportunities'
import { cn } from '@/lib/utils'

const DATE_WINDOWS = [7, 14, 30, 60, 90]

export default function OpportunityDiscoveryPage() {
  const { data: collections = [], isLoading } = useOpportunityNaicsCollections()
  const sync = useSyncSamGovOpportunities()
  const [collectionId, setCollectionId] = useState('')
  const [daysBack, setDaysBack] = useState('14')

  useEffect(() => {
    if (!collectionId && collections.length > 0) {
      setCollectionId(
        collections.find((collection) => collection.is_default)?.id ?? collections[0].id
      )
    }
  }, [collectionId, collections])

  const selected = useMemo(
    () => collections.find((collection) => collection.id === collectionId) ?? null,
    [collectionId, collections]
  )

  const runSync = () => {
    if (!collectionId) return
    sync.mutate({ collectionId, daysBack: Number(daysBack) })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title="Opportunity Discovery"
          description="Choose a Collection of NAICS codes, then use it to find matching Hawaii opportunities on SAM.gov."
          icon={SearchCheck}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/opportunities">
                <ArrowLeft className="mr-1.5 size-4" />
                Opportunity Hub
              </Link>
            </Button>
          }
        />

        <Card className="py-0 shadow-none">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-base">SAM.gov discovery collection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">NAICS Collection</label>
                <Select
                  value={collectionId}
                  onValueChange={setCollectionId}
                  disabled={isLoading || collections.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name}
                        {collection.is_default ? ' · Default' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Look back</label>
                <Select value={daysBack} onValueChange={setDaysBack}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_WINDOWS.map((days) => (
                      <SelectItem key={days} value={String(days)}>
                        Past {days} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={runSync} disabled={!selected || sync.isPending}>
                <RefreshCw className={cn('mr-1.5 size-4', sync.isPending && 'animate-spin')} />
                {sync.isPending ? 'Syncing' : 'Sync SAM.gov'}
              </Button>
            </div>

            {selected ? (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Library className="size-4" />
                      <h2 className="text-sm font-semibold">{selected.name}</h2>
                      {selected.is_default ? <Badge variant="secondary">Default</Badge> : null}
                    </div>
                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                      {selected.description}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/collections/${selected.id}`}>Edit Collection</Link>
                  </Button>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Enabled NAICS codes
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.items.map((item) => (
                      <Badge key={item.item_id} variant="outline" title={item.description}>
                        {item.code} · {item.title.replace(`${item.code} — `, '')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Loading the default Construction Opportunities Collection.
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Construction OS queries SAM.gov once for each enabled NAICS item, removes duplicate notices,
              and records the Collection and codes that caused every opportunity to match. Duplicate this
              Collection to create a different discovery profile without changing the Opportunity Hub code.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

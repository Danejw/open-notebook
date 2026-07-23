'use client'

import { List, Waypoints } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { columnHeaderIconClassName } from '@/components/projects/ColumnHeader'
import { useTranslation } from '@/lib/hooks/use-translation'

export type SourcesViewMode = 'list' | 'graph'

export interface SourcesColumnViewTabsProps {
  value: SourcesViewMode
  onChange: (value: SourcesViewMode) => void
}

export function SourcesColumnViewTabs({
  value,
  onChange,
}: SourcesColumnViewTabsProps) {
  const { t } = useTranslation()

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next === 'list' || next === 'graph') {
          onChange(next)
        }
      }}
      className="gap-0"
    >
      <TabsList className="h-6">
        <TabsTrigger
          value="list"
          className="h-5 gap-0.5 px-1.5"
          title={t('sources.viewList')}
        >
          <List className={columnHeaderIconClassName} />
          <span className="hidden sm:inline">{t('sources.viewList')}</span>
        </TabsTrigger>
        <TabsTrigger
          value="graph"
          className="h-5 gap-0.5 px-1.5"
          title={t('sources.viewGraph')}
        >
          <Waypoints className={columnHeaderIconClassName} />
          <span className="hidden sm:inline">{t('sources.viewGraph')}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

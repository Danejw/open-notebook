'use client'

import { useMemo, useState } from 'react'
import { Mic, LayoutTemplate } from 'lucide-react'

import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EpisodesTab } from '@/components/podcasts/EpisodesTab'
import { TemplatesTab } from '@/components/podcasts/TemplatesTab'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function PodcastsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'episodes' | 'templates'>('episodes')

  const templatesTab = useMemo(
    () => (activeTab === 'templates' ? <TemplatesTab /> : null),
    [activeTab]
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('podcasts.listTitle')}
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'episodes' | 'templates')}
          className={pageSectionGapClassName}
        >
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('podcasts.chooseAView')}</p>
            <TabsList aria-label={t('common.accessibility.podcastViews')} className="h-8 w-full max-w-md">
              <TabsTrigger value="episodes" className="gap-1.5 text-xs">
                <Mic className="h-3.5 w-3.5" />
                {t('podcasts.episodesTab')}
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5 text-xs">
                <LayoutTemplate className="h-3.5 w-3.5" />
                {t('podcasts.templatesTab')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="episodes">
            <EpisodesTab />
          </TabsContent>

          <TabsContent value="templates">
            {templatesTab}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

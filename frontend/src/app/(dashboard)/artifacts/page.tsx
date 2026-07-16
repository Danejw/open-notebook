'use client'

import { useState } from 'react'
import { PageHeader, pageContentClassName, pageSectionGapClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DefaultPromptEditor } from './components/DefaultPromptEditor'
import { ArtifactsList } from './components/ArtifactsList'
import { ArtifactPlayground } from './components/ArtifactPlayground'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { Artifact } from '@/lib/types/artifacts'
import { Wand2, Play } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function ArtifactsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('artifacts')
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | undefined>()
  const { data: artifacts, isLoading, refetch } = useArtifacts()

  const handlePlayground = (artifact: Artifact) => {
    setSelectedArtifact(artifact)
    setActiveTab('playground')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title={t('artifacts.title')}
          actions={
            <PageRefreshButton onClick={() => refetch()} />
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className={cn('max-w-5xl', pageSectionGapClassName)}>
          <TabsList aria-label={t('common.accessibility.artifactViews')} className="h-8 w-full max-w-md">
            <TabsTrigger value="artifacts" className="gap-1.5 text-xs">
              <Wand2 className="h-3.5 w-3.5" />
              {t('artifacts.title')}
            </TabsTrigger>
            <TabsTrigger value="playground" className="gap-1.5 text-xs">
              <Play className="h-3.5 w-3.5" />
              {t('artifacts.playground')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="artifacts" className="mt-0 space-y-3">
            <DefaultPromptEditor />
            <ArtifactsList
              artifacts={artifacts}
              isLoading={isLoading}
              onPlayground={handlePlayground}
            />
          </TabsContent>

          <TabsContent value="playground" className="mt-0">
            <ArtifactPlayground
              artifacts={artifacts}
              selectedArtifact={selectedArtifact}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

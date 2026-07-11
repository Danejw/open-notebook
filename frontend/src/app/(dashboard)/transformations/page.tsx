'use client'

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DefaultPromptEditor } from './components/DefaultPromptEditor'
import { TransformationsList } from './components/TransformationsList'
import { TransformationPlayground } from './components/TransformationPlayground'
import { useTransformations } from '@/lib/hooks/use-transformations'
import { Transformation } from '@/lib/types/transformations'
import { Wand2, Play, RefreshCw } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function TransformationsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('transformations')
  const [selectedTransformation, setSelectedTransformation] = useState<Transformation | undefined>()
  const { data: transformations, isLoading, refetch } = useTransformations()

  const handlePlayground = (transformation: Transformation) => {
    setSelectedTransformation(transformation)
    setActiveTab('playground')
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className={`${pageContentClassName} space-y-6`}>
          <PageHeader
            bordered
            title={t('transformations.title')}
            description={t('transformations.desc')}
            actions={
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => refetch()} aria-label={t('common.refresh')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            }
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-5xl space-y-4">
            <TabsList aria-label={t('common.accessibility.transformationViews')} className="h-8 w-full max-w-md">
              <TabsTrigger value="transformations" className="gap-1.5 text-xs">
                <Wand2 className="h-3.5 w-3.5" />
                {t('transformations.title')}
              </TabsTrigger>
              <TabsTrigger value="playground" className="gap-1.5 text-xs">
                <Play className="h-3.5 w-3.5" />
                {t('transformations.playground')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transformations" className="space-y-3 mt-0">
              <DefaultPromptEditor />
              <TransformationsList
                transformations={transformations}
                isLoading={isLoading}
                onPlayground={handlePlayground}
              />
            </TabsContent>

            <TabsContent value="playground" className="mt-0">
              <TransformationPlayground
                transformations={transformations}
                selectedTransformation={selectedTransformation}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  )
}

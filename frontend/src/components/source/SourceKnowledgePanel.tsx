'use client'

import { useMemo, useState } from 'react'
import { Network, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useExtractKnowledge,
  useSourceExtractors,
  useSourceKnowledge,
} from '@/lib/hooks/use-knowledge'

interface SourceKnowledgePanelProps {
  sourceId: string
  projectId?: string
}

export function SourceKnowledgePanel({ sourceId, projectId }: SourceKnowledgePanelProps) {
  const { t } = useTranslation()
  const { data: extractorData, isLoading } = useSourceExtractors(sourceId)
  const { data: knowledge } = useSourceKnowledge(sourceId)
  const extractMutation = useExtractKnowledge(sourceId)
  const [selectedExtractor, setSelectedExtractor] = useState('drawing')

  const specialized = useMemo(
    () => (extractorData?.extractors ?? []).filter((e) => !e.auto_run),
    [extractorData]
  )
  const generic = useMemo(
    () => (extractorData?.extractors ?? []).find((e) => e.id === 'generic'),
    [extractorData]
  )

  const runExtractor = (extractor: string, force = true) => {
    extractMutation.mutate({
      extractor,
      project_id: projectId,
      force,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4" />
          {t('knowledge.title')}
        </CardTitle>
        <CardDescription>{t('knowledge.sourceDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t('knowledge.genericStatus')}</span>
              <Badge variant="secondary">
                {generic?.last_run?.status ?? t('knowledge.notRun')}
              </Badge>
              {generic?.last_run?.stats && (
                <span className="text-xs text-muted-foreground">
                  {t('knowledge.statsSummary')
                    .replace(
                      '{entities}',
                      String(generic.last_run.stats.entities ?? knowledge?.entities?.length ?? 0)
                    )
                    .replace(
                      '{claims}',
                      String(generic.last_run.stats.claims ?? knowledge?.claims?.length ?? 0)
                    )}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={extractMutation.isPending}
                onClick={() => runExtractor('generic', true)}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {t('knowledge.rerunGeneric')}
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] space-y-1">
                <label className="text-sm font-medium">
                  {t('knowledge.specializedExtractor')}
                </label>
                <Select value={selectedExtractor} onValueChange={setSelectedExtractor}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('knowledge.selectExtractor')} />
                  </SelectTrigger>
                  <SelectContent>
                    {specialized.map((ext) => (
                      <SelectItem key={ext.id} value={ext.id}>
                        {ext.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={extractMutation.isPending || !selectedExtractor}
                onClick={() => runExtractor(selectedExtractor, true)}
              >
                <Play className="mr-2 h-3.5 w-3.5" />
                {t('knowledge.runExtractor')}
              </Button>
            </div>

            {knowledge?.entities && knowledge.entities.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('knowledge.entitiesCount').replace(
                    '{count}',
                    String(knowledge.entities.length)
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {knowledge.entities.slice(0, 20).map((entity) => (
                    <Badge key={entity.id} variant="outline">
                      {entity.type}: {entity.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

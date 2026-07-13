'use client'

import { useState } from 'react'
import { Network, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useEntityDetail,
  useProjectEntities,
  useRebuildProjectKnowledge,
} from '@/lib/hooks/use-knowledge'

interface ProjectKnowledgePanelProps {
  projectId: string
}

export function ProjectKnowledgePanel({ projectId }: ProjectKnowledgePanelProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const { data, isLoading } = useProjectEntities(projectId, { q: query || undefined })
  const { data: detail } = useEntityDetail(projectId, selectedEntityId)
  const rebuild = useRebuildProjectKnowledge(projectId)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Network className="h-5 w-5" />
            {t('knowledge.projectMemory')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('knowledge.projectMemoryDesc')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={rebuild.isPending}
          onClick={() => rebuild.mutate()}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {t('knowledge.rebuild')}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t('knowledge.searchEntities')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <Card className="min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('knowledge.entities')}</CardTitle>
            <CardDescription>
              {t('knowledge.entitiesCount').replace(
                '{count}',
                String(data?.total_count ?? 0)
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-3">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              ) : (data?.entities?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t('knowledge.noEntities')}</p>
              ) : (
                <ul className="space-y-1">
                  {data?.entities.map((entity) => (
                    <li key={entity.id}>
                      <button
                        type="button"
                        className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                          selectedEntityId === entity.id ? 'bg-muted' : ''
                        }`}
                        onClick={() => setSelectedEntityId(entity.id)}
                      >
                        <Badge variant="outline" className="mr-2">
                          {entity.type}
                        </Badge>
                        {entity.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('knowledge.evidenceTrail')}</CardTitle>
            <CardDescription>{t('knowledge.evidenceTrailDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-3">
              {!selectedEntityId ? (
                <p className="text-sm text-muted-foreground">
                  {t('knowledge.selectEntity')}
                </p>
              ) : !detail ? (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="font-medium">{detail.entity.label}</p>
                    <p className="text-xs text-muted-foreground">{detail.entity.type}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium">{t('knowledge.claims')}</p>
                    {(detail.claims?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('knowledge.noClaims')}</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {detail.claims.map((claim, idx) => (
                          <li key={String(claim.id ?? idx)} className="rounded border p-2">
                            <div>
                              {String(claim.predicate)} →{' '}
                              {String(claim.object_literal ?? claim.object_id ?? '')}
                            </div>
                            {claim.source_id ? (
                              <div className="text-xs text-muted-foreground">
                                {String(claim.source_id)}
                                {claim.chunk_id ? ` / ${String(claim.chunk_id)}` : ''}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium">{t('knowledge.relations')}</p>
                    {(detail.relations?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('knowledge.noRelations')}
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {detail.relations.map((rel, idx) => (
                          <li key={String(rel.id ?? idx)} className="rounded border p-2">
                            {String(rel.from_id)} --[{String(rel.type)}]→ {String(rel.to_id)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

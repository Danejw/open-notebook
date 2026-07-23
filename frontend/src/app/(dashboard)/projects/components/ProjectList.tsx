'use client'

import { ProjectResponse } from '@/lib/types/api'
import { ProjectListItem } from './ProjectListItem'
import { useProjectViewStore } from '@/lib/stores/project-view-store'
import { EmptyState } from '@/components/common/EmptyState'
import { ListRowsSkeleton } from '@/components/common/LoadingSkeletons'
import { Book, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ProjectListProps {
  projects?: ProjectResponse[]
  isLoading: boolean
  title: string
  collapsible?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onAction?: () => void
  actionLabel?: string
}

export function ProjectList({
  projects,
  isLoading,
  title,
  collapsible = false,
  emptyTitle,
  emptyDescription,
  onAction,
  actionLabel,
}: ProjectListProps) {
  const { t } = useTranslation()
  const viewMode = useProjectViewStore((state) => state.viewMode)
  const [isExpanded, setIsExpanded] = useState(!collapsible)

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-36 animate-pulse rounded bg-muted" />
        <ListRowsSkeleton rows={4} withHeader={false} />
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <EmptyState
        icon={Book}
        title={emptyTitle ?? t('common.noResults')}
        description={emptyDescription ?? t('chat.startByCreating')}
        action={
          onAction && actionLabel ? (
            <Button onClick={onAction} variant="outline" size="sm" className="mt-3 h-7 text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {actionLabel}
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {collapsible ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-label={title}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
        <h2 className="text-sm font-semibold leading-none">
          {title}{' '}
          <span className="font-normal text-muted-foreground">({projects.length})</span>
        </h2>
      </div>

      {isExpanded ? (
        viewMode === 'list' ? (
          <div className="overflow-hidden rounded-md border">
            <div className="divide-y">
              {projects.map((project) => (
                <ProjectListItem key={project.id} project={project} showMeta />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <div key={project.id} className="overflow-hidden rounded-md border">
                <ProjectListItem project={project} />
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

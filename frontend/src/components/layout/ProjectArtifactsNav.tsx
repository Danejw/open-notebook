'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Book, ChevronDown, ChevronRight, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useProjects } from '@/lib/hooks/use-projects'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useRoutePrefetch } from '@/lib/hooks/use-route-prefetch'

const SIDEBAR_PROJECT_LIMIT = 10

interface ProjectArtifactsNavProps {
  isCollapsed: boolean
}

export function ProjectArtifactsNav({ isCollapsed }: ProjectArtifactsNavProps) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const prefetchRoute = useRoutePrefetch()
  const { data: projects = [] } = useProjects(false)
  const { data: artifacts = [] } = useArtifacts()
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)

  const visibleProjects = projects.slice(0, SIDEBAR_PROJECT_LIMIT)
  const activeArtifactId = searchParams.get('artifact')

  if (isCollapsed) {
    return (
      <Link href="/projects" prefetch={false} onMouseEnter={() => prefetchRoute('/projects')}>
        <Button
          variant={pathname?.startsWith('/projects') ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-8 w-full justify-center px-0 text-sidebar-foreground sidebar-menu-item',
            pathname?.startsWith('/projects') && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <Book className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </Link>
    )
  }

  return (
    <div className="space-y-0.5">
      <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('navigation.projects')}
      </div>

      {visibleProjects.map((project) => {
        const isProjectActive = pathname === `/projects/${project.id}`
        const isExpanded = expandedProjectId === project.id || isProjectActive

        return (
          <Collapsible
            key={project.id}
            open={isExpanded}
            onOpenChange={(open) => setExpandedProjectId(open ? project.id : null)}
          >
            <div className="flex items-center gap-0.5">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-6 shrink-0 px-0 text-muted-foreground hover:text-sidebar-foreground"
                  aria-label={t('navigation.toggleProjectArtifacts')}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <Link
                href={`/projects/${project.id}`}
                prefetch={false}
                className="min-w-0 flex-1"
                onMouseEnter={() => prefetchRoute(`/projects/${project.id}`)}
              >
                <Button
                  variant={isProjectActive && !activeArtifactId ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-7 w-full justify-start truncate px-2 text-sidebar-foreground sidebar-menu-item',
                    isProjectActive &&
                      !activeArtifactId &&
                      'bg-sidebar-accent text-sidebar-accent-foreground'
                  )}
                >
                  <Book className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-sm">{project.name}</span>
                </Button>
              </Link>
            </div>

            <CollapsibleContent className="space-y-0.5 pb-1 pl-5">
              {artifacts.map((artifact) => {
                const href = `/projects/${project.id}?artifact=${encodeURIComponent(artifact.id)}`
                const isArtifactActive =
                  pathname === `/projects/${project.id}` && activeArtifactId === artifact.id

                return (
                  <Link
                    key={`${project.id}-${artifact.id}`}
                    href={href}
                    prefetch={false}
                    onMouseEnter={() => prefetchRoute(href)}
                  >
                    <Button
                      variant={isArtifactActive ? 'secondary' : 'ghost'}
                      size="sm"
                      className={cn(
                        'h-7 w-full justify-start truncate px-2 text-sidebar-foreground sidebar-menu-item',
                        isArtifactActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
                      )}
                    >
                      <Shuffle className="mr-1.5 h-3 w-3 shrink-0 opacity-70" />
                      <span className="truncate text-xs">{artifact.title}</span>
                    </Button>
                  </Link>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        )
      })}

      {projects.length > SIDEBAR_PROJECT_LIMIT ? (
        <Link href="/projects" prefetch={false} onMouseEnter={() => prefetchRoute('/projects')}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start px-2 text-xs text-muted-foreground sidebar-menu-item"
          >
            {t('navigation.viewAllProjects')}
          </Button>
        </Link>
      ) : null}
    </div>
  )
}

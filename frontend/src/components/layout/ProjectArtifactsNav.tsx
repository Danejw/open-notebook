'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Book, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useProjects } from '@/lib/hooks/use-projects'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useRoutePrefetch } from '@/lib/hooks/use-route-prefetch'

const SIDEBAR_PROJECT_LIMIT = 10

interface ProjectArtifactsNavProps {
  isCollapsed: boolean
}

export function ProjectArtifactsNav({ isCollapsed }: ProjectArtifactsNavProps) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const prefetchRoute = useRoutePrefetch()
  const { data: projects = [] } = useProjects(false)

  const visibleProjects = projects.slice(0, SIDEBAR_PROJECT_LIMIT)

  const isProjectsSectionActive = pathname?.startsWith('/projects') ?? false
  const isOpportunitiesActive = pathname === '/opportunities'
  const projectsLabel = t('navigation.projects')

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant={isOpportunitiesActive ? 'secondary' : 'ghost'}
              size="icon"
              className={cn(
                'mx-auto h-7 w-7 shrink-0 justify-center px-0 text-sidebar-foreground sidebar-menu-item',
                isOpportunitiesActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
            >
              <Link
                href="/opportunities"
                prefetch={false}
                onMouseEnter={() => prefetchRoute('/opportunities')}
                aria-current={isOpportunitiesActive ? 'page' : undefined}
                className="flex justify-center"
                aria-label="Opportunity Hub"
              >
                <Inbox className="h-3.5 w-3.5 shrink-0" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Opportunity Hub</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant={isProjectsSectionActive ? 'secondary' : 'ghost'}
              size="icon"
              className={cn(
                'mx-auto h-7 w-7 shrink-0 justify-center px-0 text-sidebar-foreground sidebar-menu-item',
                isProjectsSectionActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
            >
              <Link
                href="/projects"
                prefetch={false}
                onMouseEnter={() => prefetchRoute('/projects')}
                aria-current={isProjectsSectionActive ? 'page' : undefined}
                className="flex justify-center"
                aria-label={projectsLabel}
              >
                <Book className="h-3.5 w-3.5 shrink-0" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{projectsLabel}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-0 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
        {t('navigation.projects')}
      </div>

      <div className="flex flex-col">
        <Button
          asChild
          variant={isOpportunitiesActive ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-7 w-full justify-start truncate px-1.5 text-sidebar-foreground sidebar-menu-item',
            isOpportunitiesActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <Link
            href="/opportunities"
            prefetch={false}
            onMouseEnter={() => prefetchRoute('/opportunities')}
            aria-current={isOpportunitiesActive ? 'page' : undefined}
          >
            <Inbox className="mr-1 h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate text-[13px] leading-none">Opportunity Hub</span>
          </Link>
        </Button>

        {visibleProjects.map((project) => {
          const isProjectActive = pathname === `/projects/${project.id}`

          return (
            <Button
              asChild
              key={project.id}
              variant={isProjectActive ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(
                'h-7 w-full justify-start truncate px-1.5 text-sidebar-foreground sidebar-menu-item',
                isProjectActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
            >
              <Link
                href={`/projects/${project.id}`}
                prefetch={false}
                onMouseEnter={() => prefetchRoute(`/projects/${project.id}`)}
                aria-current={isProjectActive ? 'page' : undefined}
              >
                <Book className="mr-1 h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="truncate text-[13px] leading-none">{project.name}</span>
              </Link>
            </Button>
          )
        })}

        {projects.length > SIDEBAR_PROJECT_LIMIT ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start px-1.5 text-[11px] text-muted-foreground sidebar-menu-item"
          >
            <Link
              href="/projects"
              prefetch={false}
              onMouseEnter={() => prefetchRoute('/projects')}
              aria-current={pathname === '/projects' ? 'page' : undefined}
            >
              {t('navigation.viewAllProjects')}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

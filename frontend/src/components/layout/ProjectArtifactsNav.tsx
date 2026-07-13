'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Book } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

  if (isCollapsed) {
    return (
      <Link
        href="/projects"
        prefetch={false}
        onMouseEnter={() => prefetchRoute('/projects')}
        className="flex justify-center"
      >
        <Button
          variant={pathname?.startsWith('/projects') ? 'secondary' : 'ghost'}
          size="icon"
          className={cn(
            'mx-auto h-7 w-7 shrink-0 justify-center px-0 text-sidebar-foreground sidebar-menu-item',
            pathname?.startsWith('/projects') && 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}
        >
          <Book className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </Link>
    )
  }

  return (
    <div>
      <div className="mb-0 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
        {t('navigation.projects')}
      </div>

      <div className="flex flex-col">
        {visibleProjects.map((project) => {
          const isProjectActive = pathname === `/projects/${project.id}`

          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              prefetch={false}
              onMouseEnter={() => prefetchRoute(`/projects/${project.id}`)}
            >
              <Button
                variant={isProjectActive ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'h-7 w-full justify-start truncate px-1.5 text-sidebar-foreground sidebar-menu-item',
                  isProjectActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <Book className="mr-1 h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="truncate text-[13px] leading-none">{project.name}</span>
              </Button>
            </Link>
          )
        })}

        {projects.length > SIDEBAR_PROJECT_LIMIT ? (
          <Link href="/projects" prefetch={false} onMouseEnter={() => prefetchRoute('/projects')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start px-1.5 text-[11px] text-muted-foreground sidebar-menu-item"
            >
              {t('navigation.viewAllProjects')}
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  )
}

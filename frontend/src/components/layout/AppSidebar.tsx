'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/use-auth'
import { useSidebarStore } from '@/lib/stores/sidebar-store'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { ProjectArtifactsNav } from '@/components/layout/ProjectArtifactsNav'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { LanguageToggle } from '@/components/common/LanguageToggle'
import type { TFunction } from 'i18next'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useRoutePrefetch } from '@/lib/hooks/use-route-prefetch'
import {
  Book,
  Search,
  Mic,
  Bot,
  Shuffle,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  FileText,
  Plus,
  Wrench,
  Sparkles,
  Plug2,
} from 'lucide-react'

type NavSection = {
  title?: string
  items: Array<{
    name: string
    href: string
    icon: typeof Book
  }>
}

const getMainNavigation = (t: TFunction): NavSection[] => [
  {
    items: [
      { name: t('navigation.skills'), href: '/skills', icon: Sparkles },
      { name: t('navigation.tools'), href: '/tools', icon: Plug2 },
    ],
  },
  {
    title: t('navigation.learn'),
    items: [
      { name: t('navigation.askAndSearch'), href: '/search', icon: Search },
      { name: t('navigation.podcasts'), href: '/podcasts', icon: Mic },
    ],
  },
]

const getManageNavigation = (t: TFunction): NavSection => ({
  title: t('navigation.manage'),
  items: [
    { name: t('navigation.sources'), href: '/sources', icon: FileText },
    { name: t('navigation.artifacts'), href: '/artifacts', icon: Shuffle },
    { name: t('navigation.models'), href: '/settings/api-keys', icon: Bot },
    { name: t('navigation.advanced'), href: '/advanced', icon: Wrench },
    { name: t('navigation.settings'), href: '/settings', icon: Settings },
  ],
})

type CreateTarget = 'source' | 'project' | 'podcast'

/** Collapsed rail: 40px wide with 2px side inset and 28px icon targets */
const collapsedSidebarWidthClassName = 'w-10'
const collapsedSidebarInsetClassName = 'px-[2px]'
const collapsedSidebarButtonClassName =
  'mx-auto h-7 w-7 shrink-0 justify-center gap-0 px-0'

export function AppSidebar() {
  const { t } = useTranslation()
  const mainNavigation = getMainNavigation(t)
  const manageNavigation = getManageNavigation(t)
  const pathname = usePathname()
  const { logout } = useAuth()
  const { isCollapsed, toggleCollapse } = useSidebarStore()
  const { openSourceDialog, openProjectDialog, openPodcastDialog } = useCreateDialogs()
  const prefetchRoute = useRoutePrefetch()

  const [createMenuOpen, setCreateMenuOpen] = useState(false)

  const handleCreateSelection = (target: CreateTarget) => {
    setCreateMenuOpen(false)

    if (target === 'source') {
      openSourceDialog()
    } else if (target === 'project') {
      openProjectDialog()
    } else if (target === 'podcast') {
      openPodcastDialog()
    }
  }

  type NavItem = NavSection['items'][number]

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname?.startsWith(item.href) || false
    const handlePrefetch = () => prefetchRoute(item.href)
    const button = (
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        size={isCollapsed ? 'icon' : 'sm'}
        className={cn(
          'text-sidebar-foreground sidebar-menu-item',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          isCollapsed
            ? collapsedSidebarButtonClassName
            : 'h-7 w-full justify-start gap-1.5 px-1.5'
        )}
      >
        <item.icon className="h-3.5 w-3.5 shrink-0" />
        {!isCollapsed && <span className="truncate text-[13px] leading-none">{item.name}</span>}
      </Button>
    )

    if (isCollapsed) {
      return (
        <Tooltip key={item.name}>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              prefetch={false}
              onMouseEnter={handlePrefetch}
              className="flex justify-center"
            >
              {button}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{item.name}</TooltipContent>
        </Tooltip>
      )
    }

    return (
      <Link key={item.name} href={item.href} prefetch={false} onMouseEnter={handlePrefetch}>
        {button}
      </Link>
    )
  }

  const renderNavSection = (section: NavSection, index: number) => (
    <div
      key={section.title ?? `section-${index}`}
      className={cn(index > 0 && 'mt-1', isCollapsed && 'flex w-full flex-col items-center')}
    >
      {!isCollapsed && section.title && (
        <h3 className="mb-0 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
          {section.title}
        </h3>
      )}

      <div className={cn('flex flex-col', isCollapsed && 'items-center')}>
        {section.items.map((item) => renderNavItem(item))}
      </div>
    </div>
  )

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'app-sidebar flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden rounded-lg border border-sidebar-border bg-sidebar transition-all duration-300',
          isCollapsed ? collapsedSidebarWidthClassName : 'w-52'
        )}
      >
        <div
          className={cn(
            'flex h-9 shrink-0 items-center border-b border-sidebar-border',
            isCollapsed ? cn('justify-center', collapsedSidebarInsetClassName) : 'justify-between px-1.5'
          )}
        >
          {isCollapsed ? (
            <div className="group relative flex items-center justify-center">
              <Image
                src="/logo.svg"
                alt={t('common.appName')}
                width={18}
                height={18}
                className="transition-opacity group-hover:opacity-0"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapse}
                className={cn(collapsedSidebarButtonClassName, 'absolute opacity-0 transition-opacity hover:bg-sidebar-accent group-hover:opacity-100')}
              >
                <Menu className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-1">
                <Image src="/logo.svg" alt={t('common.appName')} width={20} height={20} />
                <span className="truncate text-[13px] font-semibold leading-none text-sidebar-foreground">
                  {t('common.appName')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapse}
                className="h-7 w-7 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent"
                data-testid="sidebar-toggle"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>

        <nav
          className={cn(
            'min-h-0 flex-1 overflow-y-auto hide-scrollbar py-1',
            isCollapsed ? cn(collapsedSidebarInsetClassName, 'flex flex-col items-center') : 'px-1.5'
          )}
        >
          <div className={cn('mb-1', isCollapsed && 'flex w-full justify-center')}>
            <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        onClick={() => setCreateMenuOpen(true)}
                        variant="default"
                        size="icon"
                        className={cn(collapsedSidebarButtonClassName, 'bg-primary text-primary-foreground hover:bg-primary/90')}
                        aria-label={t('common.create')}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t('common.create')}</TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuTrigger asChild>
                  <Button
                    onClick={() => setCreateMenuOpen(true)}
                    variant="default"
                    size="sm"
                    className="h-7 w-full justify-start bg-primary px-1.5 text-[13px] text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('common.create')}
                  </Button>
                </DropdownMenuTrigger>
              )}

              <DropdownMenuContent
                align={isCollapsed ? 'end' : 'start'}
                side={isCollapsed ? 'right' : 'bottom'}
                className="w-44"
              >
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('source')
                  }}
                  className="gap-2 text-sm"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('common.source')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('project')
                  }}
                  className="gap-2 text-sm"
                >
                  <Book className="h-3.5 w-3.5" />
                  {t('common.project')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('podcast')
                  }}
                  className="gap-2 text-sm"
                >
                  <Mic className="h-3.5 w-3.5" />
                  {t('common.podcast')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className={cn('mb-1', isCollapsed && 'flex w-full justify-center')}>
            <Suspense fallback={null}>
              <ProjectArtifactsNav isCollapsed={isCollapsed} />
            </Suspense>
          </div>

          {mainNavigation.map((section, index) => renderNavSection(section, index))}
        </nav>

        <div
          className={cn(
            'shrink-0 border-t border-sidebar-border py-1',
            isCollapsed ? cn(collapsedSidebarInsetClassName, 'flex flex-col items-center') : 'px-1.5'
          )}
        >
          {renderNavSection(manageNavigation, 0)}
        </div>

        <div
          className={cn(
            'shrink-0 space-y-1 border-t border-sidebar-border',
            isCollapsed ? cn(collapsedSidebarInsetClassName, 'flex flex-col items-center py-1') : 'p-1.5'
          )}
        >
          <div
            className={cn(
              'flex gap-1',
              isCollapsed ? 'flex-col items-center' : 'items-center [&_button]:h-7 [&_button]:flex-1'
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={isCollapsed ? 'flex justify-center' : 'flex-1'}>
                  <ThemeToggle iconOnly />
                </div>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? 'right' : 'top'}>{t('common.theme')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={isCollapsed ? 'flex justify-center' : 'flex-1'}>
                  <LanguageToggle iconOnly />
                </div>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? 'right' : 'top'}>{t('common.language')}</TooltipContent>
            </Tooltip>
          </div>

          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(collapsedSidebarButtonClassName, 'sidebar-menu-item')}
                  onClick={logout}
                  aria-label={t('common.signOut')}
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('common.signOut')}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 px-1.5 sidebar-menu-item"
              onClick={logout}
              aria-label={t('common.signOut')}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="text-[13px] leading-none">{t('common.signOut')}</span>
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

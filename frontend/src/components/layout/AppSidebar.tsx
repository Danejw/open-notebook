'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/use-auth'
import { useSidebarStore } from '@/lib/stores/sidebar-store'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
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
  Command,
  Sparkles,
  Plug2,
} from 'lucide-react'

const getNavigation = (t: TFunction) => [
  {
    title: t('navigation.collect'),
    items: [
      { name: t('navigation.sources'), href: '/sources', icon: FileText },
    ],
  },
  {
    title: t('navigation.process'),
    items: [
      { name: t('navigation.notebooks'), href: '/notebooks', icon: Book },
      { name: t('navigation.askAndSearch'), href: '/search', icon: Search },
    ],
  },
  {
    title: t('navigation.create'),
    items: [
      { name: t('navigation.podcasts'), href: '/podcasts', icon: Mic },
    ],
  },
  {
    title: t('navigation.manage'),
    items: [
      { name: t('navigation.models'), href: '/settings/api-keys', icon: Bot },
      { name: t('navigation.transformations'), href: '/transformations', icon: Shuffle },
      { name: t('navigation.skills'), href: '/skills', icon: Sparkles },
      { name: t('navigation.tools'), href: '/tools', icon: Plug2 },
      { name: t('navigation.settings'), href: '/settings', icon: Settings },
      { name: t('navigation.advanced'), href: '/advanced', icon: Wrench },
    ],
  },
] as const

type CreateTarget = 'source' | 'notebook' | 'podcast'

export function AppSidebar() {
  const { t } = useTranslation()
  const navigation = getNavigation(t)
  const pathname = usePathname()
  const { logout } = useAuth()
  const { isCollapsed, toggleCollapse } = useSidebarStore()
  const { openSourceDialog, openNotebookDialog, openPodcastDialog } = useCreateDialogs()

  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [isMac, setIsMac] = useState(true)

  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'))
  }, [])

  const handleCreateSelection = (target: CreateTarget) => {
    setCreateMenuOpen(false)

    if (target === 'source') {
      openSourceDialog()
    } else if (target === 'notebook') {
      openNotebookDialog()
    } else if (target === 'podcast') {
      openPodcastDialog()
    }
  }

  const renderNavItem = (item: (typeof navigation)[number]['items'][number]) => {
    const isActive = pathname?.startsWith(item.href) || false
    const button = (
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        size="sm"
        className={cn(
          'h-8 w-full gap-2 text-sidebar-foreground sidebar-menu-item',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          isCollapsed ? 'justify-center px-0' : 'justify-start px-2'
        )}
      >
        <item.icon className="h-3.5 w-3.5 shrink-0" />
        {!isCollapsed && <span className="truncate text-sm">{item.name}</span>}
      </Button>
    )

    if (isCollapsed) {
      return (
        <Tooltip key={item.name}>
          <TooltipTrigger asChild>
            <Link href={item.href}>{button}</Link>
          </TooltipTrigger>
          <TooltipContent side="right">{item.name}</TooltipContent>
        </Tooltip>
      )
    }

    return (
      <Link key={item.name} href={item.href}>
        {button}
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'app-sidebar flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300',
          isCollapsed ? 'w-14' : 'w-52'
        )}
      >
        <div
          className={cn(
            'flex h-11 shrink-0 items-center border-b border-sidebar-border',
            isCollapsed ? 'justify-center px-1.5' : 'justify-between px-2'
          )}
        >
          {isCollapsed ? (
            <div className="group relative flex w-full items-center justify-center">
              <Image
                src="/logo.svg"
                alt="Open Notebook"
                width={24}
                height={24}
                className="transition-opacity group-hover:opacity-0"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapse}
                className="absolute h-7 w-7 text-sidebar-foreground opacity-0 transition-opacity hover:bg-sidebar-accent group-hover:opacity-100"
              >
                <Menu className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-1.5">
                <Image src="/logo.svg" alt={t('common.appName')} width={24} height={24} />
                <span className="truncate text-sm font-semibold text-sidebar-foreground">
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

        <nav className={cn('flex-1 overflow-y-auto hide-scrollbar py-2', isCollapsed ? 'px-1.5' : 'px-2')}>
          <div className={cn('mb-2', isCollapsed ? 'px-0' : 'px-0.5')}>
            <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        onClick={() => setCreateMenuOpen(true)}
                        variant="default"
                        size="icon"
                        className="h-8 w-full bg-primary text-primary-foreground hover:bg-primary/90"
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
                    className="h-8 w-full justify-start bg-primary text-sm text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
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
                    handleCreateSelection('notebook')
                  }}
                  className="gap-2 text-sm"
                >
                  <Book className="h-3.5 w-3.5" />
                  {t('common.notebook')}
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

          {navigation.map((section, index) => (
            <div key={section.title} className={cn(index > 0 && 'mt-2')}>
              {!isCollapsed && (
                <h3 className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">
                  {section.title}
                </h3>
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => renderNavItem(item))}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'shrink-0 space-y-1.5 border-t border-sidebar-border p-2',
            isCollapsed && 'px-1.5'
          )}
        >
          {!isCollapsed && (
            <div className="flex items-center justify-between px-1.5 py-0.5 text-[10px] text-sidebar-foreground/60">
              <span className="flex items-center gap-1">
                <Command className="h-3 w-3" />
                {t('common.quickActions')}
              </span>
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground">
                {isMac ? <span className="text-[10px]">⌘</span> : <span>Ctrl+</span>}K
              </kbd>
            </div>
          )}

          <div
            className={cn(
              'flex gap-1',
              isCollapsed ? 'flex-col items-center [&_button]:h-7 [&_button]:w-8' : 'items-center [&_button]:h-7 [&_button]:flex-1'
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={isCollapsed ? 'w-full' : 'flex-1'}>
                  <ThemeToggle iconOnly />
                </div>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? 'right' : 'top'}>{t('common.theme')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={isCollapsed ? 'w-full' : 'flex-1'}>
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
                  className="h-8 w-full sidebar-menu-item"
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
              className="h-8 w-full justify-start gap-2 px-2 sidebar-menu-item"
              onClick={logout}
              aria-label={t('common.signOut')}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="text-sm">{t('common.signOut')}</span>
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

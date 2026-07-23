'use client'

import { useEffect, useState, useCallback, useMemo, useId } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useProjects } from '@/lib/hooks/use-projects'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { useTheme } from '@/lib/stores/theme-store'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import {
  Book,
  Mic,
  Bot,
  Shuffle,
  Settings,
  FileText,
  FileCode2,
  Image,
  Wrench,
  Plus,
  Sun,
  Moon,
  Monitor,
  Building2,
} from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { TFunction } from 'i18next'

const getNavigationItems = (t: TFunction) => [
  { name: t('navigation.projects'), href: '/projects', icon: Book, keywords: ['notes', 'research', 'projects'] },
  { name: t('navigation.sources'), href: '/sources', icon: FileText, keywords: ['files', 'documents', 'upload'] },
  { name: t('navigation.podcasts'), href: '/podcasts', icon: Mic, keywords: ['audio', 'episodes', 'generate'] },
  { name: t('navigation.artifacts'), href: '/artifact-templates', icon: Shuffle, keywords: ['prompts', 'templates', 'actions', 'manage'] },
  { name: t('navigation.images'), href: '/images', icon: Image, keywords: ['logo', 'media', 'picture', 'upload', 'library', 'brand'] },
  { name: t('navigation.templates'), href: '/templates', icon: FileCode2, keywords: ['bid', 'html', 'pdf', 'estimate', 'proposal', 'template', 'documents'] },
  { name: t('navigation.models'), href: '/settings/api-keys', icon: Bot, keywords: ['ai', 'llm', 'providers', 'openai', 'anthropic'] },
  { name: t('navigation.companyProfile'), href: '/settings/company-profile', icon: Building2, keywords: ['company', 'fit', 'scoring', 'licenses', 'trades', 'opportunity'] },
  { name: t('navigation.settings'), href: '/settings', icon: Settings, keywords: ['preferences', 'config', 'options'] },
  { name: t('navigation.advanced'), href: '/advanced', icon: Wrench, keywords: ['debug', 'system', 'tools'] },
]

const getCreateItems = (t: TFunction) => [
  { name: t('common.newSource'), action: 'source', icon: FileText },
  { name: t('common.newProject'), action: 'project', icon: Book },
  { name: t('common.newPodcast'), action: 'podcast', icon: Mic },
]

const getThemeItems = (t: TFunction) => [
  { name: t('common.light'), value: 'light' as const, icon: Sun, keywords: ['bright', 'day'] },
  { name: t('common.dark'), value: 'dark' as const, icon: Moon, keywords: ['night'] },
  { name: t('common.system'), value: 'system' as const, icon: Monitor, keywords: ['auto', 'default'] },
]

export function CommandPalette() {
  const { t } = useTranslation()
  const commandInputId = useId()
  const navigationItems = useMemo(() => getNavigationItems(t), [t])
  const createItems = useMemo(() => getCreateItems(t), [t])
  const themeItems = useMemo(() => getThemeItems(t), [t])
  
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  const { openSourceDialog, openProjectDialog, openPodcastDialog } = useCreateDialogs()
  const { setTheme } = useTheme()
  const { data: projects, isLoading: projectsLoading } = useProjects(false, { enabled: open })
  const { data: artifacts = [] } = useArtifacts()

  const artifactRunItems = useMemo(() => {
    if (!projects?.length || !artifacts.length) return []
    const items: Array<{ id: string; label: string; href: string; keywords: string }> = []
    for (const project of projects.slice(0, 5)) {
      for (const artifact of artifacts) {
        items.push({
          id: `${project.id}-${artifact.id}`,
          label: `${artifact.title} · ${project.name}`,
          href: `/projects/${project.id}?artifact=${encodeURIComponent(artifact.id)}`,
          keywords: `${artifact.title} ${artifact.name} ${project.name} artifact run`,
        })
      }
    }
    return items
  }, [projects, artifacts])

  // Global keyboard listener for ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Skip if focus is inside editable elements
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }

      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
        setOpen((open) => !open)
      }
    }

    // Use capture phase to intercept before other handlers
    document.addEventListener('keydown', down, true)
    return () => document.removeEventListener('keydown', down, true)
  }, [])

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false)
    setQuery('')
    // Use setTimeout to ensure dialog closes before action
    setTimeout(callback, 0)
  }, [])

  const handleNavigate = useCallback((href: string) => {
    handleSelect(() => router.push(href))
  }, [handleSelect, router])

  const handleCreate = useCallback((action: string) => {
    handleSelect(() => {
      if (action === 'source') openSourceDialog()
      else if (action === 'project') openProjectDialog()
      else if (action === 'podcast') openPodcastDialog()
    })
  }, [handleSelect, openSourceDialog, openProjectDialog, openPodcastDialog])

  const handleTheme = useCallback((theme: 'light' | 'dark' | 'system') => {
    handleSelect(() => setTheme(theme))
  }, [handleSelect, setTheme])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t('common.quickActions')}
      description={t('common.quickActionsDesc')}
      className="sm:max-w-lg"
    >
      <CommandInput
        id={commandInputId}
        name="command-search"
        placeholder={t('searchPage.enterSearchPlaceholder')}
        value={query}
        onValueChange={setQuery}
        aria-label={t('common.search')}
        autoComplete="off"
      />
      <CommandList>
        {/* Navigation */}
        <CommandGroup heading={t('navigation.nav')}>
          {navigationItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.name} ${item.keywords.join(' ')}`}
              onSelect={() => handleNavigate(item.href)}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Projects */}
        <CommandGroup heading={t('projects.title')}>
          {projectsLoading ? (
            <CommandItem disabled>
              <InlineSkeleton className="h-4 w-4" />
              <span>{t('common.loading')}</span>
            </CommandItem>
          ) : projects && projects.length > 0 ? (
            projects.map((project) => (
              <CommandItem
                key={project.id}
                value={`project ${project.name} ${project.description || ''}`}
                onSelect={() => handleNavigate(`/projects/${project.id}`)}
              >
                <Book className="h-4 w-4" />
                <span>{project.name}</span>
              </CommandItem>
            ))
          ) : null}
        </CommandGroup>

        {artifactRunItems.length > 0 ? (
          <CommandGroup heading={t('navigation.runArtifact')}>
            {artifactRunItems.map((item) => (
              <CommandItem
                key={item.id}
                value={`run artifact ${item.keywords}`}
                onSelect={() => handleNavigate(item.href)}
              >
                <Shuffle className="h-4 w-4" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {/* Create */}
        <CommandGroup heading={t('navigation.create')}>
          {createItems.map((item) => (
            <CommandItem
              key={item.action}
              value={`create ${item.name}`}
              onSelect={() => handleCreate(item.action)}
            >
              <Plus className="h-4 w-4" />
              <span>{item.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Theme */}
        <CommandGroup heading={t('navigation.theme')}>
          {themeItems.map((item) => (
            <CommandItem
              key={item.value}
              value={`theme ${item.name} ${item.keywords.join(' ')}`}
              onSelect={() => handleTheme(item.value)}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

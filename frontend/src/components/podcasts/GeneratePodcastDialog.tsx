'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'

import { useProjects } from '@/lib/hooks/use-projects'
import { useEpisodeProfiles, useGeneratePodcast } from '@/lib/hooks/use-podcasts'
import { chatApi } from '@/lib/api/chat'
import { sourcesApi } from '@/lib/api/sources'
import { projectArtifactsApi } from '@/lib/api/project-artifacts'
import { BuildContextRequest, ProjectArtifactResponse, SourceListResponse } from '@/lib/types/api'
import { PodcastGenerationRequest } from '@/lib/types/podcasts'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  dialogBodyClassName,
  dialogLargeContentClassName,
} from '@/components/ui/dialog'
import {
  ContentSelectionPanel,
  getSourceDefaultMode,
  hasSelections,
  type ProjectSelection,
  type SourceMode,
} from '@/components/podcasts/generate-podcast/ContentSelectionPanel'
import { EpisodeSettingsPanel } from '@/components/podcasts/generate-podcast/EpisodeSettingsPanel'
import { GeneratePodcastFooter } from '@/components/podcasts/generate-podcast/GeneratePodcastFooter'

interface GeneratePodcastDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GeneratePodcastDialog({ open, onOpenChange }: GeneratePodcastDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [expandedProjects, setexpandedProjects] = useState<string[]>([])
  const [selections, setSelections] = useState<Record<string, ProjectSelection>>({})
  const [episodeProfileId, setEpisodeProfileId] = useState<string>('')
  const [episodeName, setEpisodeName] = useState('')
  const [instructions, setInstructions] = useState('')

  const [isBuildingContext, setIsBuildingContext] = useState(false)
  const [tokenCount, setTokenCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)

  const projectsQuery = useProjects()
  const episodeProfilesQuery = useEpisodeProfiles()
  const generatePodcast = useGeneratePodcast()

  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data]
  )
  const episodeProfiles = useMemo(
    () => episodeProfilesQuery.episodeProfiles ?? [],
    [episodeProfilesQuery.episodeProfiles]
  )

  // Fetch sources and notes for projects using useQueries
  const sourcesQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: QUERY_KEYS.sources(project.id),
      queryFn: () => sourcesApi.list({ project_id: project.id }),
      enabled:
        open &&
        (expandedProjects.includes(project.id) || hasSelections(selections[project.id])),
    })),
  })

  const notesQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: QUERY_KEYS.projectArtifacts(project.id),
      queryFn: () => projectArtifactsApi.list({ project_id: project.id }),
      enabled:
        open &&
        (expandedProjects.includes(project.id) || hasSelections(selections[project.id])),
    })),
  })

  const sourcesByProject = useMemo<Record<string, SourceListResponse[]>>(() => {
    const map: Record<string, SourceListResponse[]> = {}
    projects.forEach((project, index) => {
      map[project.id] = sourcesQueries[index]?.data ?? []
    })
    return map
  }, [projects, sourcesQueries])

  const notesByProject = useMemo<Record<string, ProjectArtifactResponse[]>>(() => {
    const map: Record<string, ProjectArtifactResponse[]> = {}
    projects.forEach((project, index) => {
      map[project.id] = notesQueries[index]?.data ?? []
    })
    return map
  }, [projects, notesQueries])

  // Stable key for fetching state - only changes when actual fetching states change
  const fetchingKey = useMemo(
    () => sourcesQueries.map((q) => q.isFetching ? '1' : '0').join(''),
    [sourcesQueries]
  )

  // Stable set of project IDs that are currently fetching sources
  const fetchingprojectIds = useMemo(() => {
    const ids = new Set<string>()
    projects.forEach((project, index) => {
      if (sourcesQueries[index]?.isFetching) {
        ids.add(project.id)
      }
    })
    return ids
  }, [projects, fetchingKey])

  // Create a stable key based on actual data to prevent effect running on every render
  // Only changes when actual source/note IDs change, not on every useQueries reference change
  const dataKey = useMemo(() => {
    const sourceIds = sourcesQueries
      .map((q) => q.data?.map((s) => s.id)?.join(',') ?? '')
      .join('|')
    const noteIds = notesQueries
      .map((q) => q.data?.map((n) => n.id)?.join(',') ?? '')
      .join('|')
    return `${sourceIds}::${noteIds}`
  }, [sourcesQueries, notesQueries])

  // Initialise selection defaults when content loads
  // Using dataKey instead of sourcesQueries/notesQueries to prevent running on every render
  useEffect(() => {
    if (!open) {
      return
    }

    setSelections((prev) => {
      let changed = false
      const next = { ...prev }

      projects.forEach((project, index) => {
        const sources = sourcesQueries[index]?.data
        const notes = notesQueries[index]?.data

        if (!sources && !notes) {
          return
        }

        if (!next[project.id]) {
          next[project.id] = { sources: {}, notes: {} }
          changed = true
        }

        if (sources) {
          const currentSources = next[project.id].sources
          sources.forEach((source) => {
            if (!(source.id in currentSources)) {
              currentSources[source.id] = getSourceDefaultMode(source)
              changed = true
            }
          })
        }

        if (notes) {
          const currentNotes = next[project.id].notes
          notes.forEach((note) => {
            if (!(note.id in currentNotes)) {
              currentNotes[note.id] = 'full'
              changed = true
            }
          })
        }
      })

      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projects, dataKey])

  const resetState = useCallback(() => {
    setexpandedProjects([])
    setSelections({})
    setEpisodeProfileId('')
    setEpisodeName('')
    setInstructions('')
    setTokenCount(0)
    setCharCount(0)
  }, [])

  useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open, resetState])

  // Update token/char counts when selections change
  useEffect(() => {
    if (!open) {
      return
    }

    const updateContextCounts = async () => {
      // Check if there are any selections
      const hasAnySelections = Object.values(selections).some((selection) =>
        Object.values(selection.sources).some((mode) => mode !== 'off') ||
        Object.values(selection.notes).some((mode) => mode !== 'off')
      )

      if (!hasAnySelections) {
        setTokenCount(0)
        setCharCount(0)
        return
      }

      try {
        let totalTokens = 0
        let totalChars = 0

        // Build context for each project and sum up counts
        for (const [projectId, selection] of Object.entries(selections)) {
          const sourcesConfig = Object.entries(selection.sources)
            .filter(([, mode]) => mode !== 'off')
            .reduce<Record<string, string>>((acc, [sourceId, mode]) => {
              const normalizedId = sourceId.replace(/^source:/, '')
              acc[normalizedId] = 'full content'
              return acc
            }, {})

          const notesConfig = Object.entries(selection.notes)
            .filter(([, mode]) => mode !== 'off')
            .reduce<Record<string, string>>((acc, [noteId]) => {
              const normalizedId = noteId.replace(/^note:/, '')
              acc[normalizedId] = 'full content'
              return acc
            }, {})

          if (Object.keys(sourcesConfig).length === 0 && Object.keys(notesConfig).length === 0) {
            continue
          }

          const response = await chatApi.buildContext({
            project_id: projectId,
            context_config: {
              sources: sourcesConfig,
              notes: notesConfig,
            },
          })

          totalTokens += response.token_count
          totalChars += response.char_count
        }

        setTokenCount(totalTokens)
        setCharCount(totalChars)
      } catch (error) {
        console.error('Error updating context counts:', error)
        // Don't reset counts on error, keep previous values
      }
    }

    updateContextCounts()
  }, [open, selections])

  const selectedEpisodeProfile = useMemo(() => {
    if (!episodeProfileId) {
      return undefined
    }
    return episodeProfiles.find((profile) => profile.id === episodeProfileId)
  }, [episodeProfileId, episodeProfiles])

  const selectedProjectSummaries = useMemo(() => {
    return projects.map((project) => {
      const selection = selections[project.id]
      if (!selection) {
        return { projectId: project.id, sources: 0, notes: 0 }
      }
      const sourcesCount = Object.values(selection.sources).filter(
        (mode) => mode !== 'off'
      ).length
      const notesCount = Object.values(selection.notes).filter(
        (mode) => mode !== 'off'
      ).length
      return { projectId: project.id, sources: sourcesCount, notes: notesCount }
    })
  }, [projects, selections])

  const handleProjectToggle = useCallback(
    (projectId: string, checked: boolean | 'indeterminate') => {
      const shouldCheck = checked === 'indeterminate' ? true : checked
      const sources = sourcesByProject[projectId] ?? []
      const notes = notesByProject[projectId] ?? []
      setSelections((prev) => {
        if (shouldCheck) {
          const nextSources: Record<string, SourceMode> = {}
          sources.forEach((source) => {
            nextSources[source.id] = getSourceDefaultMode(source)
          })
          const nextNotes: Record<string, SourceMode> = {}
          notes.forEach((note) => {
            nextNotes[note.id] = 'full'
          })
          return {
            ...prev,
            [projectId]: {
              sources: nextSources,
              notes: nextNotes,
            },
          }
        }

        const clearedSources: Record<string, SourceMode> = {}
        sources.forEach((source) => {
          clearedSources[source.id] = 'off'
        })
        const clearedNotes: Record<string, SourceMode> = {}
        notes.forEach((note) => {
          clearedNotes[note.id] = 'off'
        })

        return {
          ...prev,
          [projectId]: {
            sources: clearedSources,
            notes: clearedNotes,
          },
        }
      })
    },
    [notesByProject, sourcesByProject]
  )

  const handleSourceModeChange = useCallback(
    (projectId: string, sourceId: string, mode: SourceMode) => {
      setSelections((prev) => ({
        ...prev,
        [projectId]: {
          sources: {
            ...(prev[projectId]?.sources ?? {}),
            [sourceId]: mode,
          },
          notes: prev[projectId]?.notes ?? {},
        },
      }))
    },
    []
  )

  const handleNoteToggle = useCallback(
    (projectId: string, noteId: string, checked: boolean | 'indeterminate') => {
      setSelections((prev) => ({
        ...prev,
        [projectId]: {
          sources: prev[projectId]?.sources ?? {},
          notes: {
            ...(prev[projectId]?.notes ?? {}),
            [noteId]: checked ? 'full' : 'off',
          },
        },
      }))
    },
    []
  )

  const buildContentFromSelections = useCallback(async () => {
    const parts: string[] = []

    const tasks: Array<{ projectId: string; payload: BuildContextRequest }> = []

    Object.entries(selections).forEach(([projectId, selection]) => {
      const sourcesConfig = Object.entries(selection.sources)
        .filter(([, mode]) => mode !== 'off')
        .reduce<Record<string, string>>((acc, [sourceId, mode]) => {
          const normalizedId = sourceId.replace(/^source:/, '')
          acc[normalizedId] = 'full content'
          return acc
        }, {})

      const notesConfig = Object.entries(selection.notes)
        .filter(([, mode]) => mode !== 'off')
        .reduce<Record<string, string>>((acc, [noteId]) => {
          const normalizedId = noteId.replace(/^note:/, '')
          acc[normalizedId] = 'full content'
          return acc
        }, {})

      if (Object.keys(sourcesConfig).length === 0 && Object.keys(notesConfig).length === 0) {
        return
      }

      tasks.push({
        projectId,
        payload: {
          project_id: projectId,
          context_config: {
            sources: sourcesConfig,
            notes: notesConfig,
          },
        },
      })
    })

    if (tasks.length === 0) {
      return ''
    }

    for (const task of tasks) {
      try {
        const response = await chatApi.buildContext(task.payload)
        const projectName = projects.find((nb) => nb.id === task.projectId)?.name ?? task.projectId
        const contextString = JSON.stringify(response.context, null, 2)
        const snippet = `${t('common.projectLabel').replace('{name}', projectName)}\n${contextString}`
        parts.push(snippet)
      } catch (error) {
        console.error('Failed to build context for project', task.projectId, error)
        throw new Error(t('podcasts.buildContextFailed'))
      }
    }

    return parts.join('\n\n')
  }, [projects, selections, t])

  const handleSubmit = useCallback(async () => {
    if (!selectedEpisodeProfile) {
      toast({
        title: t('podcasts.profileRequired'),
        description: t('podcasts.profileRequiredDesc'),
        variant: 'destructive',
      })
      return
    }

    if (!episodeName.trim()) {
      toast({
        title: t('podcasts.nameRequired'),
        description: t('podcasts.nameRequiredDesc'),
        variant: 'destructive',
      })
      return
    }

    setIsBuildingContext(true)
    try {
      const content = await buildContentFromSelections()
      if (!content.trim()) {
        toast({
          title: t('podcasts.addContext'),
          description: t('podcasts.addContextDesc'),
          variant: 'destructive',
        })
        return
      }

      const payload: PodcastGenerationRequest = {
        episode_profile: selectedEpisodeProfile.name,
        speaker_profile: selectedEpisodeProfile.speaker_config,
        episode_name: episodeName.trim(),
        content,
        briefing_suffix: instructions.trim() ? instructions.trim() : undefined,
      }

      await generatePodcast.mutateAsync(payload)

      toast({
        title: t('common.success'),
        description: t('podcasts.podcastTaskStarted'),
      })

      // Delay closing dialog slightly to ensure refetch completes
      setTimeout(() => {
        onOpenChange(false)
        resetState()
      }, 500)
    } catch (error) {
      console.error('Failed to generate podcast', error)
      toast({
        title: t('podcasts.generationFailed'),
        description: error instanceof Error ? error.message : t('common.refreshPage'),
        variant: 'destructive',
      })
    } finally {
      setIsBuildingContext(false)
    }
  }, [
    buildContentFromSelections,
    episodeName,
    generatePodcast,
    instructions,
    onOpenChange,
    resetState,
    selectedEpisodeProfile,
    toast,
    t,
  ])

  const isSubmitting = generatePodcast.isPending || isBuildingContext

  return (
    <Dialog open={open} onOpenChange={(value) => {
      onOpenChange(value)
      if (!value) {
        resetState()
      }
    }}>
      <DialogContent className={cn(dialogLargeContentClassName, 'overflow-hidden')}>
        <DialogHeader>
          <DialogTitle>{t('podcasts.generateEpisode')}</DialogTitle>
        </DialogHeader>

        <div className={cn(dialogBodyClassName, 'grid gap-3 md:grid-cols-[2fr_1fr] xl:grid-cols-[3fr_1fr]')}>
          <ContentSelectionPanel
            projects={projects}
            isLoading={projectsQuery.isLoading}
            selectedProjectSummaries={selectedProjectSummaries}
            tokenCount={tokenCount}
            charCount={charCount}
            expandedProjects={expandedProjects}
            setexpandedProjects={setexpandedProjects}
            selections={selections}
            sourcesByProject={sourcesByProject}
            notesByProject={notesByProject}
            fetchingprojectIds={fetchingprojectIds}
            handleProjectToggle={handleProjectToggle}
            handleSourceModeChange={handleSourceModeChange}
            handleNoteToggle={handleNoteToggle}
            queryClient={queryClient}
          />

          <div className="space-y-6">
            <EpisodeSettingsPanel
              isLoading={episodeProfilesQuery.isLoading}
              episodeProfiles={episodeProfiles}
              episodeProfileId={episodeProfileId}
              onEpisodeProfileIdChange={setEpisodeProfileId}
              selectedEpisodeProfile={selectedEpisodeProfile}
              episodeName={episodeName}
              onEpisodeNameChange={setEpisodeName}
              instructions={instructions}
              onInstructionsChange={setInstructions}
            />
            <GeneratePodcastFooter
              isSubmitting={isSubmitting}
              onSubmit={() => void handleSubmit()}
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

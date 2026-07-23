'use client'

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { ProjectHeader } from '@/app/(dashboard)/projects/components/ProjectHeader'
import { ProjectDesktopLayout } from '@/app/(dashboard)/projects/[id]/components/ProjectDesktopLayout'
import { ProjectMobileLayout } from '@/app/(dashboard)/projects/[id]/components/ProjectMobileLayout'
import { useProjectColumnPanels } from '@/app/(dashboard)/projects/[id]/hooks/useProjectColumnPanels'
import { useProjectChatContext } from '@/app/(dashboard)/projects/[id]/hooks/useProjectChatContext'
import { DashboardContentSkeleton } from '@/components/layout/DashboardContentSkeleton'
import { PageError } from '@/components/common/PageError'
import { useProject } from '@/lib/hooks/use-projects'
import { useProjectSources } from '@/lib/hooks/use-sources'
import { useProjectArtifacts } from '@/lib/hooks/use-project-artifacts'
import { isGeneratedArtifact } from '@/lib/utils/project-artifact-kind'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { useProjectActivityStore } from '@/lib/stores/project-activity-store'
import { useIsDesktop } from '@/lib/hooks/use-media-query'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import {
  projectPageInsetClassName,
  projectPageStackGapClassName,
} from '@/components/projects/ColumnHeader'

export default function ProjectPage() {
  return (
    <Suspense fallback={null}>
      <ProjectPageContent />
    </Suspense>
  )
}

function ProjectPageContent() {
  const { t } = useTranslation()
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const projectId = params?.id ? decodeURIComponent(params.id as string) : ''
  const artifactParam = searchParams.get('artifact')

  const { data: project, isLoading: projectLoading } = useProject(projectId)
  const { data: artifacts = [] } = useArtifacts()
  const {
    sources,
    isLoading: sourcesLoading,
    refetch: refetchSources,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useProjectSources(projectId)
  const { data: notes, isLoading: notesLoading } = useProjectArtifacts(projectId)

  const syncArtifactIds = useProjectActivityStore((state) => state.syncArtifactIds)
  const setChatViewing = useProjectActivityStore((state) => state.setChatViewing)
  const setArtifactsViewing = useProjectActivityStore(
    (state) => state.setArtifactsViewing
  )
  const hasUnseenArtifacts = useProjectActivityStore((state) =>
    Boolean(state.unseenArtifactIdsByProject[projectId]?.length)
  )
  const chatUnread = useProjectActivityStore((state) =>
    Boolean(state.chatUnreadByProject[projectId])
  )

  const isDesktop = useIsDesktop()
  const panels = useProjectColumnPanels(isDesktop)
  const {
    contextSelections,
    handleSourceContextModeChange,
    handleNoteContextModeChange,
    handleBulkSourceContext,
  } = useProjectChatContext(sources, notes)

  const [mobileActiveTab, setMobileActiveTab] = useState<
    'sources' | 'notes' | 'chat'
  >('chat')
  const [artifactRunKey, setArtifactRunKey] = useState(0)

  const activeArtifact = useMemo(() => {
    if (!artifactParam) return undefined
    return artifacts.find((artifact) => artifact.id === artifactParam)
  }, [artifactParam, artifacts])

  const hasIngestibleArtifacts = useMemo(
    () => (notes ?? []).some((note) => isGeneratedArtifact(note)),
    [notes]
  )

  useEffect(() => {
    if (!projectId || notes === undefined) return
    syncArtifactIds(
      projectId,
      notes.map((note) => note.id)
    )
  }, [projectId, notes, syncArtifactIds])

  useEffect(() => {
    if (!projectId) return
    const chatViewing = isDesktop
      ? !panels.chatCollapsed
      : mobileActiveTab === 'chat'
    const artifactsViewing = isDesktop
      ? !panels.artifactsCollapsed
      : mobileActiveTab === 'notes'
    setChatViewing(projectId, chatViewing)
    setArtifactsViewing(projectId, artifactsViewing)
  }, [
    projectId,
    isDesktop,
    panels.chatCollapsed,
    panels.artifactsCollapsed,
    mobileActiveTab,
    setChatViewing,
    setArtifactsViewing,
  ])

  const handleTemplateClick = useCallback(
    (artifactId: string) => {
      router.replace(
        `/projects/${encodeURIComponent(projectId)}?artifact=${encodeURIComponent(artifactId)}`
      )
      setArtifactRunKey((key) => key + 1)
      setMobileActiveTab('chat')
    },
    [router, projectId]
  )

  useEffect(() => {
    if (artifactParam && activeArtifact) {
      setMobileActiveTab('chat')
    }
  }, [artifactParam, activeArtifact])

  if (projectLoading && !project) {
    return <DashboardContentSkeleton projectDetail />
  }

  if (!project) {
    return (
      <PageError
        title={t('projects.notFound')}
        description={t('projects.notFoundDesc')}
        tone="muted"
        className="p-6"
      />
    )
  }

  const chatColumnProps = {
    projectId,
    contextSelections,
    sources,
    sourcesLoading,
    notes: notes ?? [],
    notesLoading,
    activeArtifact,
    artifactRunKey,
  }

  const sourcesColumnProps = {
    sources,
    isLoading: sourcesLoading,
    projectId,
    projectName: project.name,
    onRefresh: refetchSources,
    contextSelections: contextSelections.sources,
    onContextModeChange: handleSourceContextModeChange,
    onBulkContextModeChange: handleBulkSourceContext,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    hasArtifactTemplates: artifacts.length > 0,
    hasIngestibleArtifacts,
  }

  const artifactsColumnProps = {
    notes,
    isLoading: notesLoading,
    projectId,
    contextSelections: contextSelections.notes,
    onContextModeChange: handleNoteContextModeChange,
    onTemplateClick: handleTemplateClick,
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-shrink-0 px-2 pt-px pb-0">
        <ProjectHeader project={project} />
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden',
          projectPageInsetClassName,
          projectPageStackGapClassName
        )}
      >
        {!isDesktop && (
          <ProjectMobileLayout
            mobileActiveTab={mobileActiveTab}
            onMobileTabChange={setMobileActiveTab}
            hasUnseenArtifacts={hasUnseenArtifacts}
            chatUnread={chatUnread}
            sourcesColumnProps={sourcesColumnProps}
            artifactsColumnProps={artifactsColumnProps}
            chatColumnProps={chatColumnProps}
          />
        )}

        {isDesktop && (
          <ProjectDesktopLayout
            defaultLayout={panels.defaultLayout}
            onLayoutChanged={panels.onLayoutChanged}
            sourcesPanelRef={panels.sourcesPanelRef}
            notesPanelRef={panels.notesPanelRef}
            chatPanelRef={panels.chatPanelRef}
            sourcesCollapsed={panels.sourcesCollapsed}
            artifactsCollapsed={panels.artifactsCollapsed}
            chatCollapsed={panels.chatCollapsed}
            onSourcesPanelResize={panels.handleSourcesPanelResize}
            onNotesPanelResize={panels.handleNotesPanelResize}
            onChatPanelResize={panels.handleChatPanelResize}
            onNotesChatSeparatorPointerDown={
              panels.handleNotesChatSeparatorPointerDown
            }
            sourcesColumnProps={sourcesColumnProps}
            artifactsColumnProps={artifactsColumnProps}
            chatColumnProps={chatColumnProps}
          />
        )}
      </div>
    </div>
  )
}

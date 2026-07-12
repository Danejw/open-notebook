'use client'

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { ProjectHeader } from '../components/ProjectHeader'
import { SourcesColumn } from '../components/SourcesColumn'
import { ArtifactsColumn } from '../components/ArtifactsColumn'
import { ChatColumn } from '../components/ChatColumn'
import { useProject } from '@/lib/hooks/use-projects'
import { useProjectSources } from '@/lib/hooks/use-sources'
import { useNotes } from '@/lib/hooks/use-notes'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { useProjectColumnsStore } from '@/lib/stores/project-columns-store'
import { useIsDesktop } from '@/lib/hooks/use-media-query'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { FileText, MessageSquare, Boxes } from 'lucide-react'
import {
  applyBulkSourceContext,
  applyBulkNoteContext,
  computeSourceSelections,
  computeNoteSelections,
  type SourceContextDefault,
  type SourceBulkAction,
  type NoteContextDefault,
} from '@/lib/utils/source-context'

// Re-exported from the shared types module for backward compatibility; several
// components historically import these from this route file.
import type { ContextMode, ContextSelections, NoteContextMode } from '@/lib/types/project-context'
export type { ContextMode, ContextSelections, NoteContextMode }

const PROJECT_LAYOUT_STORAGE =
  typeof window === 'undefined'
    ? { getItem: () => null, setItem: () => {} }
    : localStorage

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
  const { data: notes, isLoading: notesLoading } = useNotes(projectId)

  // Get collapse states for dynamic layout
  const { sourcesCollapsed, notesCollapsed, setSources, setNotes } = useProjectColumnsStore()

  // Detect desktop to avoid double-mounting ChatColumn
  const isDesktop = useIsDesktop()

  // Persist column widths across reloads (desktop only)
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'project-detail-columns',
    panelIds: ['sources', 'notes', 'chat'],
    storage: PROJECT_LAYOUT_STORAGE,
    onlySaveAfterUserInteractions: true,
  })

  const sourcesPanelRef = usePanelRef()
  const notesPanelRef = usePanelRef()

  // Keep resizable panels in sync with the existing collapse toggles
  useEffect(() => {
    if (!isDesktop) return
    const panel = sourcesPanelRef.current
    if (!panel) return
    if (sourcesCollapsed && !panel.isCollapsed()) {
      panel.collapse()
    } else if (!sourcesCollapsed && panel.isCollapsed()) {
      panel.expand()
    }
  }, [isDesktop, sourcesCollapsed, sourcesPanelRef])

  useEffect(() => {
    if (!isDesktop) return
    const panel = notesPanelRef.current
    if (!panel) return
    if (notesCollapsed && !panel.isCollapsed()) {
      panel.collapse()
    } else if (!notesCollapsed && panel.isCollapsed()) {
      panel.expand()
    }
  }, [isDesktop, notesCollapsed, notesPanelRef])

  const handleSourcesPanelResize = () => {
    const isCollapsed = sourcesPanelRef.current?.isCollapsed() ?? false
    if (useProjectColumnsStore.getState().sourcesCollapsed !== isCollapsed) {
      setSources(isCollapsed)
    }
  }

  const handleNotesPanelResize = () => {
    const isCollapsed = notesPanelRef.current?.isCollapsed() ?? false
    if (useProjectColumnsStore.getState().notesCollapsed !== isCollapsed) {
      setNotes(isCollapsed)
    }
  }

  // Mobile tab state (Sources, Notes, or Chat)
  const [mobileActiveTab, setMobileActiveTab] = useState<'sources' | 'notes' | 'chat'>('chat')
  const [artifactRunKey, setArtifactRunKey] = useState(0)

  const activeArtifact = useMemo(() => {
    if (!artifactParam) return undefined
    return artifacts.find((artifact) => artifact.id === artifactParam)
  }, [artifactParam, artifacts])

  const handleClearArtifact = useCallback(() => {
    router.replace(`/projects/${encodeURIComponent(projectId)}`)
  }, [router, projectId])

  const handleTemplateClick = useCallback((artifactId: string) => {
    router.replace(`/projects/${encodeURIComponent(projectId)}?artifact=${encodeURIComponent(artifactId)}`)
    setArtifactRunKey((key) => key + 1)
    setMobileActiveTab('chat')
  }, [router, projectId])

  useEffect(() => {
    if (artifactParam && activeArtifact) {
      setMobileActiveTab('chat')
    }
  }, [artifactParam, activeArtifact])

  // Context selection state
  const [contextSelections, setContextSelections] = useState<ContextSelections>({
    sources: {},
    notes: {}
  })

  // The default context mode applied to sources as they load. A bulk
  // include/exclude updates this so sources loaded later via pagination follow
  // the same intent instead of reverting to "included" (#223/#915).
  const [sourceContextDefault, setSourceContextDefault] = useState<SourceContextDefault>('include')

  // Same idea for notes loaded later (notes are binary: included/off).
  const [noteContextDefault, setNoteContextDefault] = useState<NoteContextDefault>('include')

  // Initialize and update selections when sources load or change
  useEffect(() => {
    if (sources && sources.length > 0) {
      setContextSelections(prev => ({
        ...prev,
        sources: computeSourceSelections(prev.sources, sources, sourceContextDefault),
      }))
    }
  }, [sources, sourceContextDefault])

  useEffect(() => {
    if (notes && notes.length > 0) {
      setContextSelections(prev => ({
        ...prev,
        notes: computeNoteSelections(prev.notes, notes, noteContextDefault),
      }))
    }
  }, [notes, noteContextDefault])

  const handleSourceContextModeChange = (sourceId: string, mode: ContextMode) => {
    setContextSelections(prev => ({
      ...prev,
      sources: {
        ...prev.sources,
        [sourceId]: mode
      }
    }))
  }

  const handleNoteContextModeChange = (noteId: string, mode: NoteContextMode) => {
    setContextSelections(prev => ({
      ...prev,
      notes: {
        ...prev.notes,
        [noteId]: mode
      }
    }))
  }

  // Bulk-apply a context action (insights-only / full / exclude) to every
  // source at once (#223). Also records the action as the default for sources
  // loaded later (#915).
  const handleBulkSourceContext = (action: SourceBulkAction) => {
    setSourceContextDefault(action)
    setContextSelections(prev => ({
      ...prev,
      sources: applyBulkSourceContext(prev.sources, sources ?? [], action),
    }))
  }

  // Bulk include/exclude every note from the chat context at once (#223).
  const handleBulkNoteContext = (action: NoteContextDefault) => {
    setNoteContextDefault(action)
    setContextSelections(prev => ({
      ...prev,
      notes: applyBulkNoteContext(prev.notes, notes ?? [], action),
    }))
  }

  if (projectLoading && !project) {
    return (
              <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-shrink-0 px-3 pt-3 pb-0">
            <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="flex-1 px-1.5 py-2 flex gap-1">
            <div className="flex-[28] animate-pulse rounded-lg bg-muted min-h-[200px]" />
            <div className="flex-[28] animate-pulse rounded-lg bg-muted min-h-[200px]" />
            <div className="flex-[44] animate-pulse rounded-lg bg-muted min-h-[200px]" />
          </div>
        </div>
    )
  }

  if (!project) {
    return (
              <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">{t('projects.notFound')}</h1>
          <p className="text-muted-foreground">{t('projects.notFoundDesc')}</p>
        </div>
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
    onClearArtifact: activeArtifact ? handleClearArtifact : undefined,
    artifactRunKey,
  }

  return (
          <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 px-3 pt-3 pb-0">
          <ProjectHeader project={project} />
        </div>

        <div className="flex-1 px-1.5 py-2 overflow-x-auto flex flex-col min-h-0">
          {/* Mobile: Tabbed interface - only render on mobile to avoid double-mounting */}
          {!isDesktop && (
            <>
              <div className="lg:hidden mb-4">
                <Tabs value={mobileActiveTab} onValueChange={(value) => setMobileActiveTab(value as 'sources' | 'notes' | 'chat')}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="sources" className="gap-2">
                      <FileText className="h-4 w-4" />
                      {t('navigation.sources')}
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="gap-2">
                      <Boxes className="h-4 w-4" />
                      {t('common.artifacts')}
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="gap-2">
                      <MessageSquare className="h-4 w-4" />
                      {t('common.chat')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Mobile: Show only active tab */}
              <div className="flex-1 overflow-hidden lg:hidden">
                {mobileActiveTab === 'sources' && (
                  <SourcesColumn
                    sources={sources}
                    isLoading={sourcesLoading}
                    projectId={projectId}
                    projectName={project?.name}
                    onRefresh={refetchSources}
                    contextSelections={contextSelections.sources}
                    onContextModeChange={handleSourceContextModeChange}
                    onBulkContextModeChange={handleBulkSourceContext}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    fetchNextPage={fetchNextPage}
                  />
                )}
                {mobileActiveTab === 'notes' && (
                  <ArtifactsColumn
                    notes={notes}
                    isLoading={notesLoading}
                    projectId={projectId}
                    contextSelections={contextSelections.notes}
                    onContextModeChange={handleNoteContextModeChange}
                    onBulkContextModeChange={handleBulkNoteContext}
                    templates={artifacts}
                    onTemplateClick={(artifact) => handleTemplateClick(artifact.id)}
                  />
                )}
                {mobileActiveTab === 'chat' && (
                  <ChatColumn {...chatColumnProps} />
                )}
              </div>
            </>
          )}

          {/* Desktop: Resizable collapsible columns */}
          {isDesktop && (
            <ResizablePanelGroup
              id="project-detail-columns"
              orientation="horizontal"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
              className="h-full min-h-0"
            >
              <ResizablePanel
                id="sources"
                panelRef={sourcesPanelRef}
                defaultSize="28%"
                minSize="14%"
                collapsible
                collapsedSize={48}
                className="min-h-0"
                onResize={handleSourcesPanelResize}
              >
                <SourcesColumn
                  sources={sources}
                  isLoading={sourcesLoading}
                  projectId={projectId}
                  projectName={project?.name}
                  onRefresh={refetchSources}
                  contextSelections={contextSelections.sources}
                  onContextModeChange={handleSourceContextModeChange}
                  onBulkContextModeChange={handleBulkSourceContext}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  fetchNextPage={fetchNextPage}
                />
              </ResizablePanel>

              <ResizableHandle
                withHandle
                disabled={sourcesCollapsed}
                className="mx-0.5 w-1.5 rounded-full bg-transparent hover:bg-border/60"
              />

              <ResizablePanel
                id="notes"
                panelRef={notesPanelRef}
                defaultSize="28%"
                minSize="14%"
                collapsible
                collapsedSize={48}
                className="min-h-0"
                onResize={handleNotesPanelResize}
              >
                <ArtifactsColumn
                  notes={notes}
                  isLoading={notesLoading}
                  projectId={projectId}
                  contextSelections={contextSelections.notes}
                  onContextModeChange={handleNoteContextModeChange}
                  onBulkContextModeChange={handleBulkNoteContext}
                  templates={artifacts}
                  onTemplateClick={(artifact) => handleTemplateClick(artifact.id)}
                />
              </ResizablePanel>

              <ResizableHandle
                withHandle
                disabled={notesCollapsed}
                className="mx-0.5 w-1.5 rounded-full bg-transparent hover:bg-border/60"
              />

              <ResizablePanel
                id="chat"
                defaultSize="44%"
                minSize="24%"
                className="min-h-0 min-w-0"
              >
                <ChatColumn {...chatColumnProps} />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
  )
}

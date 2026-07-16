'use client'

import { Suspense, useState, useEffect, useMemo, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
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
import { cn } from '@/lib/utils'
import {
  projectPageInsetClassName,
  projectPageStackGapClassName,
} from '@/components/projects/ColumnHeader'
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
  const { sourcesCollapsed, notesCollapsed, chatCollapsed, setSources, setNotes, setChat } =
    useProjectColumnsStore()

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
  const chatPanelRef = usePanelRef()

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

  useEffect(() => {
    if (!isDesktop) return
    const panel = chatPanelRef.current
    if (!panel) return
    if (chatCollapsed && !panel.isCollapsed()) {
      panel.collapse()
    } else if (!chatCollapsed && panel.isCollapsed()) {
      panel.expand()
    }
  }, [isDesktop, chatCollapsed, chatPanelRef])

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

  const handleChatPanelResize = () => {
    const isCollapsed = chatPanelRef.current?.isCollapsed() ?? false
    if (useProjectColumnsStore.getState().chatCollapsed !== isCollapsed) {
      setChat(isCollapsed)
    }
  }

  // When Artifacts is already collapsed, the shared separator can't shrink Chat
  // via the library (it would try to expand Artifacts first). Intercept a
  // rightward drag on that handle and collapse Chat imperatively instead.
  const collapseChatDragRef = useRef<{ startX: number; active: boolean } | null>(null)

  const handleNotesChatSeparatorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!notesCollapsed || chatCollapsed) return

      collapseChatDragRef.current = { startX: event.clientX, active: true }

      const onPointerMove = (moveEvent: PointerEvent) => {
        const drag = collapseChatDragRef.current
        if (!drag?.active) return
        if (moveEvent.clientX - drag.startX < 28) return

        drag.active = false
        chatPanelRef.current?.collapse()
        setChat(true)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      const onPointerUp = () => {
        collapseChatDragRef.current = null
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [notesCollapsed, chatCollapsed, chatPanelRef, setChat]
  )

  // Mobile tab state (Sources, Notes, or Chat)
  const [mobileActiveTab, setMobileActiveTab] = useState<'sources' | 'notes' | 'chat'>('chat')
  const [artifactRunKey, setArtifactRunKey] = useState(0)

  const activeArtifact = useMemo(() => {
    if (!artifactParam) return undefined
    return artifacts.find((artifact) => artifact.id === artifactParam)
  }, [artifactParam, artifacts])

  const hasIngestibleArtifacts = useMemo(
    () => (notes ?? []).some((note) => note.note_type === 'artifact'),
    [notes]
  )

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

  // Bulk-apply a context action (full / exclude) to every
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
          <div className="flex-shrink-0 px-2 pt-px pb-0">
            <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
          </div>
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              projectPageInsetClassName,
              projectPageStackGapClassName
            )}
          >
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
    artifactRunKey,
  }

  return (
          <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 px-2 pt-px pb-0">
          <ProjectHeader project={project} />
        </div>

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-x-auto',
            projectPageInsetClassName,
            projectPageStackGapClassName
          )}
        >
          {/* Mobile: Tabbed interface - only render on mobile to avoid double-mounting */}
          {!isDesktop && (
            <>
              <div className="shrink-0 lg:hidden">
                <Tabs
                  className="gap-0"
                  value={mobileActiveTab}
                  onValueChange={(value) => setMobileActiveTab(value as 'sources' | 'notes' | 'chat')}
                >
                  <TabsList className="grid h-auto w-full grid-cols-3 gap-0 p-0.5">
                    <TabsTrigger value="sources" className="h-7 gap-1 px-2 text-xs">
                      <FileText className="h-3.5 w-3.5" />
                      {t('navigation.sources')}
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="h-7 gap-1 px-2 text-xs">
                      <Boxes className="h-3.5 w-3.5" />
                      {t('common.artifacts')}
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="h-7 gap-1 px-2 text-xs">
                      <MessageSquare className="h-3.5 w-3.5" />
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
                    hasArtifactTemplates={artifacts.length > 0}
                    hasIngestibleArtifacts={hasIngestibleArtifacts}
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
                    onTemplateClick={handleTemplateClick}
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
                  hasArtifactTemplates={artifacts.length > 0}
                  hasIngestibleArtifacts={hasIngestibleArtifacts}
                />
              </ResizablePanel>

              <ResizableHandle
                withHandle
                disabled={sourcesCollapsed}
                className="mx-0 w-1 rounded-full bg-transparent hover:bg-border/60"
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
                  onTemplateClick={handleTemplateClick}
                />
              </ResizablePanel>

              <ResizableHandle
                withHandle
                // When Artifacts is collapsed, disable library resize so a rightward
                // drag doesn't expand it. onPointerDown still collapses Chat.
                disabled={notesCollapsed}
                disableDoubleClick={notesCollapsed && !chatCollapsed}
                onPointerDown={handleNotesChatSeparatorPointerDown}
                style={
                  notesCollapsed && !chatCollapsed
                    ? { cursor: 'col-resize' }
                    : undefined
                }
                className="mx-0 w-1 rounded-full bg-transparent hover:bg-border/60"
              />

              <ResizablePanel
                id="chat"
                panelRef={chatPanelRef}
                defaultSize="44%"
                minSize="14%"
                collapsible
                collapsedSize={48}
                className="min-h-0 min-w-0"
                onResize={handleChatPanelResize}
              >
                <ChatColumn {...chatColumnProps} />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
  )
}

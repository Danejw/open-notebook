'use client'

import type { ComponentProps, PointerEvent as ReactPointerEvent } from 'react'
import type {
  Layout,
  LayoutChangedMeta,
  PanelImperativeHandle,
} from 'react-resizable-panels'
import { SourcesColumn } from '@/app/(dashboard)/projects/components/SourcesColumn'
import { ArtifactsColumn } from '@/app/(dashboard)/projects/components/ArtifactsColumn'
import { ChatColumn } from '@/app/(dashboard)/projects/components/ChatColumn'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

type SourcesColumnProps = ComponentProps<typeof SourcesColumn>
type ArtifactsColumnProps = ComponentProps<typeof ArtifactsColumn>
type ChatColumnProps = ComponentProps<typeof ChatColumn>

export interface ProjectDesktopLayoutProps {
  defaultLayout: Layout | undefined
  onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
  sourcesPanelRef: React.RefObject<PanelImperativeHandle | null>
  notesPanelRef: React.RefObject<PanelImperativeHandle | null>
  chatPanelRef: React.RefObject<PanelImperativeHandle | null>
  sourcesCollapsed: boolean
  artifactsCollapsed: boolean
  chatCollapsed: boolean
  onSourcesPanelResize: () => void
  onNotesPanelResize: () => void
  onChatPanelResize: () => void
  onNotesChatSeparatorPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>
  ) => void
  sourcesColumnProps: SourcesColumnProps
  artifactsColumnProps: ArtifactsColumnProps
  chatColumnProps: ChatColumnProps
}

export function ProjectDesktopLayout({
  defaultLayout,
  onLayoutChanged,
  sourcesPanelRef,
  notesPanelRef,
  chatPanelRef,
  sourcesCollapsed,
  artifactsCollapsed,
  chatCollapsed,
  onSourcesPanelResize,
  onNotesPanelResize,
  onChatPanelResize,
  onNotesChatSeparatorPointerDown,
  sourcesColumnProps,
  artifactsColumnProps,
  chatColumnProps,
}: ProjectDesktopLayoutProps) {
  return (
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
        onResize={onSourcesPanelResize}
      >
        <SourcesColumn {...sourcesColumnProps} />
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
        onResize={onNotesPanelResize}
      >
        <ArtifactsColumn {...artifactsColumnProps} />
      </ResizablePanel>

      <ResizableHandle
        withHandle
        disabled={artifactsCollapsed}
        disableDoubleClick={artifactsCollapsed && !chatCollapsed}
        onPointerDown={onNotesChatSeparatorPointerDown}
        style={
          artifactsCollapsed && !chatCollapsed
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
        onResize={onChatPanelResize}
      >
        <ChatColumn {...chatColumnProps} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

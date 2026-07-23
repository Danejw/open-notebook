'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { useProjectColumnsStore } from '@/lib/stores/project-columns-store'

const PROJECT_LAYOUT_STORAGE =
  typeof window === 'undefined'
    ? { getItem: () => null, setItem: () => {} }
    : localStorage

/**
 * Desktop resizable column panel refs, layout persistence, and collapse sync.
 */
export function useProjectColumnPanels(isDesktop: boolean) {
  const { sourcesCollapsed, artifactsCollapsed, chatCollapsed, setSources, setArtifacts, setChat } =
    useProjectColumnsStore()

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'project-detail-columns',
    panelIds: ['sources', 'notes', 'chat'],
    storage: PROJECT_LAYOUT_STORAGE,
    onlySaveAfterUserInteractions: true,
  })

  const sourcesPanelRef = usePanelRef()
  const notesPanelRef = usePanelRef()
  const chatPanelRef = usePanelRef()

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
    if (artifactsCollapsed && !panel.isCollapsed()) {
      panel.collapse()
    } else if (!artifactsCollapsed && panel.isCollapsed()) {
      panel.expand()
    }
  }, [isDesktop, artifactsCollapsed, notesPanelRef])

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
    if (useProjectColumnsStore.getState().artifactsCollapsed !== isCollapsed) {
      setArtifacts(isCollapsed)
    }
  }

  const handleChatPanelResize = () => {
    const isCollapsed = chatPanelRef.current?.isCollapsed() ?? false
    if (useProjectColumnsStore.getState().chatCollapsed !== isCollapsed) {
      setChat(isCollapsed)
    }
  }

  const collapseChatDragRef = useRef<{ startX: number; active: boolean } | null>(
    null
  )

  const handleNotesChatSeparatorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!artifactsCollapsed || chatCollapsed) return

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
    [artifactsCollapsed, chatCollapsed, chatPanelRef, setChat]
  )

  return {
    sourcesCollapsed,
    artifactsCollapsed,
    chatCollapsed,
    defaultLayout,
    onLayoutChanged,
    sourcesPanelRef,
    notesPanelRef,
    chatPanelRef,
    handleSourcesPanelResize,
    handleNotesPanelResize,
    handleChatPanelResize,
    handleNotesChatSeparatorPointerDown,
  }
}

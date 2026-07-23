'use client'

import { useEffect, useState } from 'react'
import type { ProjectArtifactResponse } from '@/lib/types/api'
import type { SourceListResponse } from '@/lib/types/api'
import type {
  ContextMode,
  ContextSelections,
  NoteContextMode,
} from '@/lib/types/project-context'
import {
  applyBulkSourceContext,
  computeSourceSelections,
  computeNoteSelections,
  type SourceContextDefault,
  type SourceBulkAction,
  type NoteContextDefault,
} from '@/lib/utils/source-context'

/**
 * Chat context selection state for sources and notes on the project page.
 */
export function useProjectChatContext(
  sources: SourceListResponse[] | undefined,
  notes: ProjectArtifactResponse[] | undefined
) {
  const [contextSelections, setContextSelections] = useState<ContextSelections>({
    sources: {},
    notes: {},
  })

  const [sourceContextDefault, setSourceContextDefault] =
    useState<SourceContextDefault>('include')
  const [noteContextDefault, setNoteContextDefault] =
    useState<NoteContextDefault>('include')

  useEffect(() => {
    if (sources && sources.length > 0) {
      setContextSelections((prev) => ({
        ...prev,
        sources: computeSourceSelections(
          prev.sources,
          sources,
          sourceContextDefault
        ),
      }))
    }
  }, [sources, sourceContextDefault])

  useEffect(() => {
    if (notes && notes.length > 0) {
      setContextSelections((prev) => ({
        ...prev,
        notes: computeNoteSelections(prev.notes, notes, noteContextDefault),
      }))
    }
  }, [notes, noteContextDefault])

  const handleSourceContextModeChange = (
    sourceId: string,
    mode: ContextMode
  ) => {
    setContextSelections((prev) => ({
      ...prev,
      sources: {
        ...prev.sources,
        [sourceId]: mode,
      },
    }))
  }

  const handleNoteContextModeChange = (
    noteId: string,
    mode: NoteContextMode
  ) => {
    setContextSelections((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [noteId]: mode,
      },
    }))
  }

  const handleBulkSourceContext = (action: SourceBulkAction) => {
    setSourceContextDefault(action)
    setContextSelections((prev) => ({
      ...prev,
      sources: applyBulkSourceContext(prev.sources, sources ?? [], action),
    }))
  }

  return {
    contextSelections,
    handleSourceContextModeChange,
    handleNoteContextModeChange,
    handleBulkSourceContext,
  }
}

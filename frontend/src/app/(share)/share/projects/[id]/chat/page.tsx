'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChatPanel } from '@/components/source/ChatPanel'
import { bindSharedProjectChatPanelProps } from '@/components/source/bindChatPanelProps'
import { ChatPanelSkeleton } from '@/components/common/LoadingSkeletons'
import { PageError } from '@/components/common/PageError'
import { useProject } from '@/lib/hooks/use-projects'
import { useProjectChat } from '@/lib/hooks/useProjectChat'
import { useProjectArtifacts } from '@/lib/hooks/use-project-artifacts'
import { useProjectSources } from '@/lib/hooks/use-sources'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ContextSelections } from '@/lib/types/project-context'
import {
  computeNoteSelections,
  computeSourceSelections,
} from '@/lib/utils/source-context'
import { getOrCreateShareGuestKey } from '@/lib/utils/share-guest-key'

export default function SharedProjectChatPage() {
  const { t } = useTranslation()
  const params = useParams()
  const projectId = params?.id ? decodeURIComponent(params.id as string) : ''

  const [guestKey, setGuestKey] = useState('')

  useEffect(() => {
    if (!projectId) return
    setGuestKey(getOrCreateShareGuestKey(projectId))
  }, [projectId])

  const { data: project, isLoading: projectLoading, error: projectError } =
    useProject(projectId)
  const {
    sources,
    isLoading: sourcesLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    error: sourcesError,
  } = useProjectSources(projectId)
  const { data: notes = [], isLoading: notesLoading } =
    useProjectArtifacts(projectId)

  // Drain all source pages so the context pool is the full project brain.
  // Stop paging if the query errors so we never hang on skeletons.
  useEffect(() => {
    if (!projectId || sourcesError) return
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [projectId, hasNextPage, isFetchingNextPage, fetchNextPage, sourcesError])

  const contextSelections: ContextSelections = useMemo(
    () => ({
      sources: computeSourceSelections({}, sources, 'full'),
      notes: computeNoteSelections({}, notes, 'include'),
    }),
    [sources, notes]
  )

  // Ready after initial load; treat missing next page (or a sources error) as done.
  const sourcesReady =
    !sourcesLoading && (Boolean(sourcesError) || !hasNextPage) && !isFetchingNextPage

  const chat = useProjectChat({
    projectId,
    sources,
    notes,
    contextSelections,
    activeArtifactId: null,
    guestKey: guestKey || null,
    sharedMode: true,
  })

  // Don't block the whole page on session list; chat can start with an empty thread.
  const pageLoading = !guestKey || projectLoading || notesLoading || !sourcesReady

  if (projectError || (!projectLoading && !project)) {
    return (
      <div className="flex h-dvh w-full items-center justify-center p-6">
        <PageError title={t('share.projectNotFound')} tone="muted" centered />
      </div>
    )
  }

  if (pageLoading) {
    return <ChatPanelSkeleton immersive className="h-dvh" />
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <ChatPanel
        {...bindSharedProjectChatPanelProps(chat, {
          title: project?.name || t('share.chatTitle'),
          projectId,
          guestKey: guestKey || null,
          variant: 'immersive',
        })}
      />
    </div>
  )
}

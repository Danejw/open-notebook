'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ChatWorkspace } from '@/components/chat/ChatWorkspace'
import { Skeleton } from '@/components/ui/skeleton'
import { useProject } from '@/lib/hooks/use-projects'
import { useProjectChat } from '@/lib/hooks/useProjectChat'
import { useNotes } from '@/lib/hooks/use-notes'
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
  const { data: notes = [], isLoading: notesLoading } = useNotes(projectId)

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
        <p className="text-muted-foreground">{t('share.projectNotFound')}</p>
      </div>
    )
  }

  if (pageLoading) {
    return (
      <div className="flex h-dvh w-full flex-col bg-background">
        <div className="shrink-0 border-b border-border/60 px-5 py-4 sm:px-6 sm:py-5">
          <Skeleton className="h-7 w-56 sm:h-8 sm:w-72" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-5 sm:px-6 sm:pt-6 md:px-10 lg:px-14">
          <Skeleton className="ml-auto h-10 w-2/5 max-w-md rounded-2xl" />
          <Skeleton className="h-24 w-3/4 max-w-2xl rounded-2xl" />
          <Skeleton className="h-16 w-2/3 max-w-xl rounded-2xl" />
        </div>
        <div className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6 sm:py-4 md:px-10 lg:px-14">
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <ChatWorkspace
        title={project?.name || t('share.chatTitle')}
        contextType="project"
        projectId={projectId}
        guestKey={guestKey || null}
        variant="immersive"
        messages={chat.messages}
        isStreaming={chat.isSending}
        streamStatus={chat.streamStatus}
        activityLog={chat.activityLog}
        contextIndicators={null}
        onSendMessage={(message) => {
          void chat.sendMessage(message)
        }}
        onEditMessage={(messageId, content) => {
          void chat.editAndResend(messageId, content)
        }}
        currentSessionId={chat.currentSessionId}
        loadingSessions={chat.loadingSessions}
      />
    </div>
  )
}

'use client'

import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import { PageError } from '@/components/common/PageError'
import { useProjectChat } from '@/lib/hooks/useProjectChat'
import { ChatPanel } from '@/components/source/ChatPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import type { ContextSelections } from '@/lib/types/project-context'
import { useTranslation } from '@/lib/hooks/use-translation'
import { NoteResponse, SourceListResponse } from '@/lib/types/api'
import type { Artifact } from '@/lib/types/artifacts'
import { CollapsibleColumn, createCollapseButton } from '@/components/projects/CollapsibleColumn'
import { useProjectColumnsStore } from '@/lib/stores/project-columns-store'

interface ChatColumnProps {
  projectId: string
  contextSelections: ContextSelections
  sources: SourceListResponse[]
  sourcesLoading: boolean
  notes: NoteResponse[]
  notesLoading: boolean
  activeArtifact?: Artifact
  artifactRunKey?: number
}

export function ChatColumn({
  projectId,
  contextSelections,
  sources,
  sourcesLoading,
  notes,
  notesLoading,
  activeArtifact,
  artifactRunKey = 0,
}: ChatColumnProps) {
  const { t } = useTranslation()
  const { chatCollapsed, toggleChat } = useProjectColumnsStore()
  const chatLabel = t('common.chat')
  const collapseButton = useMemo(
    () => createCollapseButton(toggleChat, chatLabel),
    [toggleChat, chatLabel]
  )

  const chat = useProjectChat({
    projectId,
    sources,
    notes,
    contextSelections,
    activeArtifactId: activeArtifact?.id ?? null,
  })

  // Apply artifact-linked skills / tools / template when the user clicks an artifact.
  const appliedDefaultsKeyRef = useRef(0)
  useLayoutEffect(() => {
    if (
      artifactRunKey > 0 &&
      activeArtifact &&
      appliedDefaultsKeyRef.current !== artifactRunKey
    ) {
      appliedDefaultsKeyRef.current = artifactRunKey
      chat.applyArtifactDefaults(activeArtifact)
    }
  }, [artifactRunKey, activeArtifact, chat.applyArtifactDefaults])

  const contextStats = useMemo(() => {
    let sourcesFull = 0
    let notesCount = 0

    sources.forEach((source) => {
      const mode = contextSelections.sources[source.id]
      if (mode === 'full') {
        sourcesFull++
      }
    })

    notes.forEach((note) => {
      const mode = contextSelections.notes[note.id]
      if (mode === 'full') {
        notesCount++
      }
    })

    return {
      sourcesFull,
      notesCount,
      tokenCount: chat.tokenCount,
      charCount: chat.charCount,
    }
  }, [sources, notes, contextSelections, chat.tokenCount, chat.charCount])

  const showChatSkeleton = sourcesLoading && sources.length === 0

  const chatTitle = activeArtifact
    ? `${t('chat.chatWithProject')} · ${activeArtifact.title}`
    : t('chat.chatWithProject')

  let content: ReactNode

  if (showChatSkeleton) {
    content = (
      <Card className="flex h-full flex-col">
        <CardContent className="flex flex-1 flex-col gap-3 p-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="flex-1 rounded-lg" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  } else if (!sources && !notes) {
    content = (
      <Card className="flex h-full flex-col">
        <CardContent className="flex flex-1 items-center justify-center">
          <PageError
            title={t('chat.unableToLoadChat')}
            description={t('common.refreshPage') || 'Please try refreshing the page'}
            tone="muted"
            centered
          />
        </CardContent>
      </Card>
    )
  } else {
    content = (
      <ChatPanel
        title={chatTitle}
        contextType="project"
        messages={chat.messages}
        isStreaming={chat.isSending}
        isDirectStreaming={chat.isDirectSending}
        streamStatus={chat.streamStatus}
        activityLog={chat.activityLog}
        contextIndicators={null}
        onSendMessage={(message, modelOverride) => chat.sendMessage(message, modelOverride)}
        onEnqueueMessage={chat.enqueueMessage}
        onEditMessage={(messageId, content, modelOverride) =>
          chat.editAndResend(messageId, content, modelOverride)
        }
        historyEditDisabled={chat.queueHasWork}
        queue={chat.queue}
        onPauseQueue={chat.pauseQueue}
        onResumeQueue={chat.resumeQueue}
        onEditQueueItem={chat.editQueueItem}
        onDeleteQueueItem={chat.deleteQueueItem}
        onRetryQueueItem={chat.retryQueueItem}
        onReorderQueue={chat.reorderQueue}
        modelOverride={chat.currentSession?.model_override ?? chat.pendingModelOverride ?? undefined}
        onModelChange={(model) => chat.setModelOverride(model ?? null)}
        sessions={chat.sessions}
        currentSessionId={chat.currentSessionId}
        onCreateSession={(title) => chat.createSession(title)}
        onSelectSession={chat.switchSession}
        onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
        onDeleteSession={chat.deleteSession}
        loadingSessions={chat.loadingSessions || notesLoading}
        projectContextStats={contextStats}
        projectId={projectId}
        selectedSkillIds={chat.selectedSkillIds}
        onSkillIdsChange={chat.setSelectedSkillIds}
        selectedHtmlTemplateId={chat.selectedHtmlTemplateId}
        onHtmlTemplateIdChange={chat.setSelectedHtmlTemplateId}
        selectedMcpToolIds={chat.selectedMcpToolIds}
        onMcpToolIdsChange={chat.setSelectedMcpToolIds}
        liveMcpToolCalls={chat.liveMcpToolCalls}
        activeArtifact={activeArtifact}
        noteSaveTitle={activeArtifact?.title}
        artifactPrefillKey={artifactRunKey}
        headerActions={collapseButton}
      />
    )
  }

  return (
    <CollapsibleColumn
      isCollapsed={chatCollapsed}
      onToggle={toggleChat}
      collapsedIcon={MessageSquare}
      collapsedLabel={chatLabel}
    >
      {content}
    </CollapsibleColumn>
  )
}

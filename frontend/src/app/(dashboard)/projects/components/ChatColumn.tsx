'use client'

import { useMemo } from 'react'
import { useProjectChat } from '@/lib/hooks/useProjectChat'
import { ChatPanel } from '@/components/source/ChatPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import type { ContextSelections } from '@/lib/types/project-context'
import { useTranslation } from '@/lib/hooks/use-translation'
import { NoteResponse, SourceListResponse } from '@/lib/types/api'

interface ChatColumnProps {
  projectId: string
  contextSelections: ContextSelections
  sources: SourceListResponse[]
  sourcesLoading: boolean
  notes: NoteResponse[]
  notesLoading: boolean
}

export function ChatColumn({
  projectId,
  contextSelections,
  sources,
  sourcesLoading,
  notes,
  notesLoading,
}: ChatColumnProps) {
  const { t } = useTranslation()

  const chat = useProjectChat({
    projectId,
    sources,
    notes,
    contextSelections,
  })

  const contextStats = useMemo(() => {
    let sourcesInsights = 0
    let sourcesFull = 0
    let notesCount = 0

    sources.forEach((source) => {
      const mode = contextSelections.sources[source.id]
      if (mode === 'insights') {
        sourcesInsights++
      } else if (mode === 'full') {
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
      sourcesInsights,
      sourcesFull,
      notesCount,
      tokenCount: chat.tokenCount,
      charCount: chat.charCount,
    }
  }, [sources, notes, contextSelections, chat.tokenCount, chat.charCount])

  const showChatSkeleton = sourcesLoading && sources.length === 0

  if (showChatSkeleton) {
    return (
      <Card className="flex h-full flex-col">
        <CardContent className="flex flex-1 flex-col gap-3 p-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="flex-1 rounded-lg" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!sources && !notes) {
    return (
      <Card className="flex h-full flex-col">
        <CardContent className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-sm">{t('chat.unableToLoadChat')}</p>
            <p className="mt-2 text-xs">{t('common.refreshPage') || 'Please try refreshing the page'}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <ChatPanel
      title={t('chat.chatWithProject')}
      contextType="project"
      messages={chat.messages}
      isStreaming={chat.isSending}
      streamStatus={chat.streamStatus}
      activityLog={chat.activityLog}
      contextIndicators={null}
      onSendMessage={(message, modelOverride) => chat.sendMessage(message, modelOverride)}
      onEditMessage={(messageId, content, modelOverride) =>
        chat.editAndResend(messageId, content, modelOverride)
      }
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
      selectedMcpToolIds={chat.selectedMcpToolIds}
      onMcpToolIdsChange={chat.setSelectedMcpToolIds}
      liveMcpToolCalls={chat.liveMcpToolCalls}
    />
  )
}

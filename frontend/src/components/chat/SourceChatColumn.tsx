'use client'

import { type ReactNode } from 'react'
import { useSourceChat } from '@/lib/hooks/useSourceChat'
import { ChatWorkspace } from '@/components/chat/ChatWorkspace'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { columnCardClassName } from '@/components/projects/ColumnHeader'

export interface SourceChatColumnProps {
  sourceId: string
  /** First linked project — used for citation modals in message rows. */
  projectId?: string
  sourceTitle?: string
  loading?: boolean
  variant?: 'column' | 'immersive'
  headerActions?: ReactNode
}

export function SourceChatColumn({
  sourceId,
  projectId,
  sourceTitle,
  loading = false,
  variant = 'column',
  headerActions,
}: SourceChatColumnProps) {
  const { t } = useTranslation()
  const chat = useSourceChat(sourceId)

  const chatTitle = sourceTitle
    ? t('chat.chatWith').replace('{name}', sourceTitle)
    : undefined

  if (loading) {
    return (
      <Card className={columnCardClassName}>
        <CardContent className="flex flex-1 flex-col gap-3 p-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="flex-1 rounded-lg" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <ChatWorkspace
      title={chatTitle}
      contextType="source"
      variant={variant}
      sourceId={sourceId}
      projectId={projectId}
      messages={chat.messages}
      isStreaming={chat.isStreaming}
      isDirectStreaming={chat.isDirectSending}
      streamStatus={chat.streamStatus}
      activityLog={chat.activityLog}
      contextIndicators={chat.contextIndicators}
      onSendMessage={(message, modelOverride) => chat.sendMessage(message, modelOverride)}
      onEnqueueMessage={chat.enqueueMessage}
      onCancelStreaming={chat.cancelStreaming}
      historyEditDisabled={chat.queueHasWork}
      queue={chat.queue}
      onPauseQueue={chat.pauseQueue}
      onResumeQueue={chat.resumeQueue}
      onEditQueueItem={chat.editQueueItem}
      onDeleteQueueItem={chat.deleteQueueItem}
      onRetryQueueItem={chat.retryQueueItem}
      onReorderQueue={chat.reorderQueue}
      modelOverride={
        chat.currentSession?.model_override ?? chat.pendingModelOverride ?? undefined
      }
      onModelChange={(model) => chat.setModelOverride(model ?? null)}
      selectedSkillIds={chat.selectedSkillIds}
      onSkillIdsChange={chat.setSelectedSkillIds}
      selectedHtmlTemplateId={chat.selectedHtmlTemplateId}
      onHtmlTemplateIdChange={chat.setSelectedHtmlTemplateId}
      selectedMcpToolIds={chat.selectedMcpToolIds}
      onMcpToolIdsChange={chat.setSelectedMcpToolIds}
      liveMcpToolCalls={chat.liveMcpToolCalls}
      sessions={chat.sessions}
      currentSessionId={chat.currentSessionId}
      onCreateSession={(title) => chat.createSession({ title })}
      onSelectSession={chat.switchSession}
      onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
      onDeleteSession={chat.deleteSession}
      loadingSessions={chat.loadingSessions}
      headerActions={headerActions}
    />
  )
}

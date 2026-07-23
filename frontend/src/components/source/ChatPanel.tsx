'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  BaseChatSession
} from '@/lib/types/api'
import { ChatToolCall } from '@/lib/types/mcp'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { columnCardClassName } from '@/components/projects/ColumnHeader'
import type { Artifact } from '@/lib/types/artifacts'
import {
  ChatQueuePanel,
  type ChatQueuePanelProps,
} from '@/components/source/ChatQueuePanel'
import type {
  ChatQueueItemUpdatePayload,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'
import { ChatSessionHeader } from '@/components/source/ChatSessionHeader'
import { ChatPanelMessages } from '@/components/source/ChatPanelMessages'
import { ChatContextStrip } from '@/components/source/ChatContextStrip'
import { ChatComposer } from '@/components/source/ChatComposer'

export interface ChatPanelProps {
  messages: SourceChatMessage[]
  isStreaming: boolean
  /**
   * True only while a live AG-UI turn (not a queue drain) owns the session.
   * Used to defer queue runner scheduling until that turn ends.
   */
  isDirectStreaming?: boolean
  streamStatus?: string | null
  activityLog?: string[]
  contextIndicators: SourceChatContextIndicator | null
  onSendMessage: (message: string, modelOverride?: string) => void
  onEnqueueMessage?: (
    message: string,
    options: {
      modelOverride?: string
      loopCount: number
      scheduleRunner?: boolean
    }
  ) => void | Promise<unknown>
  onEditMessage?: (messageId: string, content: string, modelOverride?: string) => void
  historyEditDisabled?: boolean
  composerDisabled?: boolean
  modelOverride?: string
  onModelChange?: (model?: string) => void
  sessions?: BaseChatSession[]
  currentSessionId?: string | null
  onCreateSession?: (title: string) => void
  onSelectSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onUpdateSession?: (sessionId: string, title: string) => void
  loadingSessions?: boolean
  title?: string
  titleAdornment?: ReactNode
  contextType?: 'source' | 'project'
  projectId?: string
  sourceId?: string
  guestKey?: string | null
  enableSuggestions?: boolean
  selectedSkillIds?: string[]
  onSkillIdsChange?: (ids: string[]) => void
  selectedCollectionIds?: string[]
  onCollectionIdsChange?: (ids: string[]) => void
  selectedHtmlTemplateId?: string | null
  onHtmlTemplateIdChange?: (id: string | null) => void
  selectedMcpToolIds?: string[]
  onMcpToolIdsChange?: (ids: string[]) => void
  liveMcpToolCalls?: ChatToolCall[]
  activeArtifact?: Artifact
  noteSaveTitle?: string
  artifactPrefillKey?: number
  headerActions?: ReactNode
  variant?: 'column' | 'immersive'
  queue?: ChatQueueResponse
  onPauseQueue?: ChatQueuePanelProps['onPause']
  onResumeQueue?: ChatQueuePanelProps['onResume']
  onEditQueueItem?: (
    itemId: string,
    payload: ChatQueueItemUpdatePayload
  ) => void | Promise<unknown>
  onDeleteQueueItem?: ChatQueuePanelProps['onDeleteItem']
  onRetryQueueItem?: ChatQueuePanelProps['onRetryItem']
  onReorderQueue?: ChatQueuePanelProps['onReorder']
  queueStreamError?: Error | null
  onRetryQueueStream?: () => void
}

export function ChatPanel({
  messages,
  isStreaming,
  isDirectStreaming: _isDirectStreaming = false,
  streamStatus,
  activityLog = [],
  contextIndicators,
  onSendMessage,
  onEnqueueMessage,
  onEditMessage,
  historyEditDisabled,
  composerDisabled = false,
  modelOverride,
  onModelChange,
  sessions = [],
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onUpdateSession,
  loadingSessions = false,
  title,
  titleAdornment,
  contextType = 'project',
  projectId,
  sourceId,
  guestKey = null,
  enableSuggestions = true,
  selectedSkillIds,
  onSkillIdsChange,
  selectedCollectionIds,
  onCollectionIdsChange,
  selectedHtmlTemplateId,
  onHtmlTemplateIdChange,
  selectedMcpToolIds,
  onMcpToolIdsChange,
  liveMcpToolCalls = [],
  activeArtifact,
  noteSaveTitle,
  artifactPrefillKey = 0,
  headerActions,
  variant = 'column',
  queue,
  onPauseQueue,
  onResumeQueue,
  onEditQueueItem,
  onDeleteQueueItem,
  onRetryQueueItem,
  onReorderQueue,
  queueStreamError = null,
  onRetryQueueStream,
}: ChatPanelProps) {
  const { t } = useTranslation()
  const [nearBottom, setNearBottom] = useState(true)
  const scrollToBottomRef = useRef<(() => void) | null>(null)
  const isImmersive = variant === 'immersive'
  const resolvedTitle =
    title ||
    (contextType === 'source'
      ? t('chat.chatWith').replace('{name}', t('navigation.sources'))
      : t('chat.chatWith').replace('{name}', t('common.project')))

  const hasQueueControls =
    Boolean(
      queue &&
        onPauseQueue &&
        onResumeQueue &&
        onEditQueueItem &&
        onDeleteQueueItem &&
        onRetryQueueItem &&
        onReorderQueue
    )

  return (
    <Card
      className={cn(
        columnCardClassName,
        isImmersive && 'rounded-none border-0 bg-transparent shadow-none ring-0'
      )}
    >
      <ChatSessionHeader
        title={resolvedTitle}
        titleAdornment={titleAdornment}
        variant={variant}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
        onUpdateSession={onUpdateSession}
        loadingSessions={loadingSessions}
        headerActions={headerActions}
      />

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <ChatPanelMessages
          messages={messages}
          isStreaming={isStreaming}
          streamStatus={streamStatus}
          activityLog={activityLog}
          currentSessionId={currentSessionId}
          projectId={projectId}
          noteSaveTitle={noteSaveTitle}
          htmlTemplateId={selectedHtmlTemplateId ?? null}
          liveMcpToolCalls={liveMcpToolCalls}
          onEditMessage={onEditMessage}
          historyEditDisabled={historyEditDisabled}
          modelOverride={modelOverride}
          contextType={contextType}
          variant={variant}
          onNearBottomChange={setNearBottom}
          scrollToBottomRef={scrollToBottomRef}
        />

        {hasQueueControls ? (
          <ChatQueuePanel
            queue={queue!}
            onPause={onPauseQueue!}
            onResume={onResumeQueue!}
            onEditItem={onEditQueueItem!}
            onDeleteItem={onDeleteQueueItem!}
            onRetryItem={onRetryQueueItem!}
            onReorder={onReorderQueue!}
            streamError={queueStreamError}
            onRetryStream={onRetryQueueStream}
          />
        ) : null}

        <ChatContextStrip contextIndicators={contextIndicators} />

        <ChatComposer
          variant={variant}
          isStreaming={isStreaming}
          composerDisabled={composerDisabled}
          onSendMessage={onSendMessage}
          onEnqueueMessage={onEnqueueMessage}
          modelOverride={modelOverride}
          onModelChange={onModelChange}
          selectedSkillIds={selectedSkillIds}
          onSkillIdsChange={onSkillIdsChange}
          selectedCollectionIds={selectedCollectionIds}
          onCollectionIdsChange={onCollectionIdsChange}
          selectedHtmlTemplateId={selectedHtmlTemplateId}
          onHtmlTemplateIdChange={onHtmlTemplateIdChange}
          selectedMcpToolIds={selectedMcpToolIds}
          onMcpToolIdsChange={onMcpToolIdsChange}
          activeArtifact={activeArtifact}
          artifactPrefillKey={artifactPrefillKey}
          enableSuggestions={enableSuggestions}
          contextType={contextType}
          projectId={projectId}
          sourceId={sourceId}
          guestKey={guestKey}
          currentSessionId={currentSessionId}
          messageCount={messages.length}
          queue={queue}
          showJumpToBottom={!nearBottom && messages.length > 0}
          onJumpToBottom={() => scrollToBottomRef.current?.()}
        />
      </CardContent>
    </Card>
  )
}

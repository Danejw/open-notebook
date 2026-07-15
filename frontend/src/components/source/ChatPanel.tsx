'use client'

import { useState, useId, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Send, FileText, Lightbulb, StickyNote, Clock } from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  BaseChatSession
} from '@/lib/types/api'
import { ChatModelOverrideDialog } from '@/components/source/ChatModelOverrideDialog'
import { SkillPicker } from '@/components/skills/SkillPicker'
import { ToolPicker } from '@/components/mcp/ToolPicker'
import { TemplatePicker } from '@/components/templates/TemplatePicker'
import { ToolCallCard } from '@/components/mcp/ToolCallCard'
import { ChatMessageList } from '@/components/source/ChatMessageList'
import { useMcpSessionToolCalls } from '@/lib/hooks/use-mcp'
import {
  groupToolCallsByMessage,
  mergeMcpToolCalls,
} from '@/lib/ag-ui/mcp-tool-calls'
import { ChatToolCall } from '@/lib/types/mcp'
import { ContextIndicator } from '@/components/common/ContextIndicator'
import { AgentActivityStatus } from '@/components/common/AgentActivityStatus'
import { SessionManager } from '@/components/source/SessionManager'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useTranslation } from '@/lib/hooks/use-translation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  ColumnHeader,
  columnCardClassName,
  columnFooterClassName,
  columnHeaderGhostButtonClassName,
  columnHeaderIconClassName,
} from '@/components/projects/ColumnHeader'
import type { Artifact } from '@/lib/types/artifacts'
import {
  ActiveArtifactBar,
  buildArtifactTriggerMessage,
} from '@/components/projects/ActiveArtifactBar'
import { ChatSuggestionPills } from '@/components/source/ChatSuggestionPills'
import { useChatSuggestions } from '@/lib/hooks/useChatSuggestions'
import { useChatUiStore } from '@/lib/stores/chat-ui-store'
import {
  ChatQueuePanel,
  type ChatQueuePanelProps,
} from '@/components/source/ChatQueuePanel'
import type {
  ChatQueueItemUpdatePayload,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'
import { shouldDeferChatToQueue } from '@/lib/types/chat-queue'

interface ProjectContextStats {
  sourcesInsights: number
  sourcesFull: number
  notesCount: number
  tokenCount?: number
  charCount?: number
}

interface ChatPanelProps {
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
  // Session management props
  sessions?: BaseChatSession[]
  currentSessionId?: string | null
  onCreateSession?: (title: string) => void
  onSelectSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onUpdateSession?: (sessionId: string, title: string) => void
  loadingSessions?: boolean
  // Generic props for reusability
  title?: string
  contextType?: 'source' | 'project'
  projectContextStats?: ProjectContextStats
  projectId?: string
  /** Source chat id — enables source-scoped suggestion pills */
  sourceId?: string
  /** Shared-chat guest key for suggestion API scoping */
  guestKey?: string | null
  /** When false, suggestion pills are disabled */
  enableSuggestions?: boolean
  selectedSkillIds?: string[]
  onSkillIdsChange?: (ids: string[]) => void
  selectedHtmlTemplateId?: string | null
  onHtmlTemplateIdChange?: (id: string | null) => void
  // MCP tools selection (transient per message)
  selectedMcpToolIds?: string[]
  onMcpToolIdsChange?: (ids: string[]) => void
  liveMcpToolCalls?: ChatToolCall[]
  activeArtifact?: Artifact
  onClearArtifact?: () => void
  noteSaveTitle?: string
  autoSendArtifactKey?: number
  /** Optional trailing header actions (e.g. column collapse control) */
  headerActions?: ReactNode
  /**
   * `column` — compact project-panel chrome.
   * `immersive` — full-bleed shared/chat surfaces with roomier header & message spacing.
   */
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
  contextType = 'source',
  projectContextStats,
  projectId,
  sourceId,
  guestKey = null,
  enableSuggestions = true,
  selectedSkillIds,
  onSkillIdsChange,
  selectedHtmlTemplateId,
  onHtmlTemplateIdChange,
  selectedMcpToolIds,
  onMcpToolIdsChange,
  liveMcpToolCalls = [],
  activeArtifact,
  onClearArtifact,
  noteSaveTitle,
  autoSendArtifactKey = 0,
  headerActions,
  variant = 'column',
  queue,
  onPauseQueue,
  onResumeQueue,
  onEditQueueItem,
  onDeleteQueueItem,
  onRetryQueueItem,
  onReorderQueue,
}: ChatPanelProps) {
  const { t } = useTranslation()
  const chatInputId = useId()
  const { data: persistedToolCalls = [] } = useMcpSessionToolCalls(currentSessionId)

  const mergedToolCalls = useMemo(
    () => mergeMcpToolCalls(persistedToolCalls, liveMcpToolCalls),
    [persistedToolCalls, liveMcpToolCalls]
  )

  const toolCallsByMessageId = useMemo(
    () => groupToolCallsByMessage(messages, mergedToolCalls),
    [messages, mergedToolCalls]
  )

  const pendingToolCalls = useMemo(() => {
    const messageIds = new Set(messages.map((message) => message.id))
    return mergedToolCalls.filter(
      (call) => call.message_id && !messageIds.has(call.message_id)
    )
  }, [mergedToolCalls, messages])
  const [input, setInput] = useState('')
  const prefilledArtifactRef = useRef<string | null>(null)
  const autoSentArtifactRef = useRef<number>(0)
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const { openModal } = useModalManager()
  const queueMode = Boolean(onEnqueueMessage)
  const deferToQueue = shouldDeferChatToQueue(isStreaming, queue)
  // Queue mode keeps the composer open so users can stack messages while a turn runs.
  const composerBusy = !queueMode && (composerDisabled || isStreaming)
  const historyEditLocked = historyEditDisabled ?? isStreaming

  const suggestionsCollapsed = useChatUiStore((s) => s.suggestionsCollapsed)
  const setSuggestionsCollapsed = useChatUiStore((s) => s.setSuggestionsCollapsed)

  const {
    suggestions,
    isLoading: suggestionsLoading,
    recordSuggestionUsed,
    recordManualSend,
  } = useChatSuggestions({
    scope: contextType === 'project' ? 'project' : 'source',
    projectId: projectId ?? null,
    sourceId: sourceId ?? null,
    sessionId: currentSessionId ?? null,
    messageCount: messages.length,
    enabled: enableSuggestions && !suggestionsCollapsed,
    guestKey,
  })

  const submitMessage = useCallback(
    async (message: string) => {
      if (onEnqueueMessage && deferToQueue) {
        await onEnqueueMessage(message, {
          loopCount: 1,
          modelOverride,
          // Never schedule a competing drain while any turn owns the session
          // (live AG-UI or an in-flight queue claim). The active drain loop
          // claims the next pending item; live turns hand off via ensureRunner.
          scheduleRunner: !isStreaming,
        })
        return
      }
      onSendMessage(message, modelOverride)
    },
    [
      deferToQueue,
      isStreaming,
      modelOverride,
      onEnqueueMessage,
      onSendMessage,
    ]
  )

  useEffect(() => {
    if (!activeArtifact) {
      prefilledArtifactRef.current = null
      return
    }
    if (
      autoSendArtifactKey > 0 &&
      autoSentArtifactRef.current !== autoSendArtifactKey &&
      !composerBusy
    ) {
      autoSentArtifactRef.current = autoSendArtifactKey
      void submitMessage(buildArtifactTriggerMessage(activeArtifact.title))
        .then(() => setInput(''))
        .catch(() => undefined)
      prefilledArtifactRef.current = activeArtifact.id
      return
    }
    if (prefilledArtifactRef.current !== activeArtifact.id) {
      setInput(buildArtifactTriggerMessage(activeArtifact.title))
      prefilledArtifactRef.current = activeArtifact.id
    }
  }, [
    activeArtifact,
    autoSendArtifactKey,
    composerBusy,
    submitMessage,
  ])

  const handleReferenceClick = useCallback(
    (type: string, id: string) => {
      const modalType = type === 'source_insight' ? 'insight' : (type as 'source' | 'note' | 'insight')

      try {
        openModal(modalType, id)
      } catch {
        toast.error(t('common.noResults'))
      }
    },
    [openModal, t]
  )

  const startEditingMessage = useCallback(
    (messageId: string, content: string) => {
      if (historyEditLocked || !onEditMessage) return
      setEditingMessageId(messageId)
      setEditDraft(content)
    },
    [historyEditLocked, onEditMessage]
  )

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null)
    setEditDraft('')
  }, [])

  const submitEditedMessage = useCallback(() => {
    if (
      !editingMessageId ||
      !editDraft.trim() ||
      historyEditLocked ||
      !onEditMessage
    ) return
    onEditMessage(editingMessageId, editDraft.trim(), modelOverride)
    setEditingMessageId(null)
    setEditDraft('')
  }, [
    editDraft,
    editingMessageId,
    historyEditLocked,
    modelOverride,
    onEditMessage,
  ])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submitEditedMessage()
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        cancelEditingMessage()
      }
    },
    [cancelEditingMessage, submitEditedMessage]
  )

  const streamingMessageId =
    isStreaming && messages.length > 0
      ? [...messages].reverse().find((m) => m.type === 'ai')?.id
      : undefined

  const handleSend = async () => {
    if (input.trim() && !composerBusy) {
      recordManualSend()
      const message = input.trim()
      try {
        await submitMessage(message)
        setInput('')
      } catch {
        // Keep the draft; enqueueMessage already toasted the failure.
      }
    }
  }

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      if (composerBusy || !suggestion.trim()) return
      recordSuggestionUsed()
      void submitMessage(suggestion.trim())
        .then(() => setInput(''))
        .catch(() => undefined)
    },
    [composerBusy, recordSuggestionUsed, submitMessage]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const keyHint = 'Enter'
  const isImmersive = variant === 'immersive'
  const resolvedTitle =
    title ||
    (contextType === 'source'
      ? t('chat.chatWith').replace('{name}', t('navigation.sources'))
      : t('chat.chatWith').replace('{name}', t('common.project')))

  return (
    <>
      <Card
        className={cn(
          columnCardClassName,
          isImmersive &&
            'rounded-none border-0 bg-transparent shadow-none ring-0'
        )}
      >
        <ColumnHeader
          title={resolvedTitle}
          className={
            isImmersive
              ? 'gap-3 border-border/60 px-5 py-4 sm:px-6 sm:py-5'
              : undefined
          }
          titleClassName={
            isImmersive ? 'text-lg font-semibold leading-snug tracking-tight sm:text-xl' : undefined
          }
          actions={
            (onSelectSession && onCreateSession && onDeleteSession) || headerActions ? (
              <>
                {onSelectSession && onCreateSession && onDeleteSession ? (
                  <Dialog open={sessionManagerOpen} onOpenChange={setSessionManagerOpen}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={columnHeaderGhostButtonClassName}
                      onClick={() => setSessionManagerOpen(true)}
                      disabled={loadingSessions}
                    >
                      <Clock className={columnHeaderIconClassName} />
                      {t('chat.sessions')}
                    </Button>
                    <DialogContent className="p-0 overflow-hidden [&>button]:z-10">
                      <DialogTitle className="sr-only">{t('chat.sessionsTitle')}</DialogTitle>
                      <SessionManager
                        sessions={sessions}
                        currentSessionId={currentSessionId ?? null}
                        onCreateSession={(sessionTitle) => onCreateSession?.(sessionTitle)}
                        onSelectSession={(sessionId) => {
                          onSelectSession(sessionId)
                          setSessionManagerOpen(false)
                        }}
                        onUpdateSession={(sessionId, sessionTitle) => onUpdateSession?.(sessionId, sessionTitle)}
                        onDeleteSession={(sessionId) => onDeleteSession?.(sessionId)}
                        loadingSessions={loadingSessions}
                      />
                    </DialogContent>
                  </Dialog>
                ) : null}
                {headerActions}
              </>
            ) : undefined
          }
        />

        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingMessageId={streamingMessageId}
            editingMessageId={editingMessageId}
            editDraft={editDraft}
            projectId={projectId}
            noteSaveTitle={noteSaveTitle}
            htmlTemplateId={selectedHtmlTemplateId ?? null}
            toolCallsByMessageId={toolCallsByMessageId}
            canEdit={Boolean(onEditMessage)}
            editLocked={editingMessageId !== null}
            onReferenceClick={handleReferenceClick}
            onStartEdit={startEditingMessage}
            onEditDraftChange={setEditDraft}
            onCancelEdit={cancelEditingMessage}
            onSubmitEdit={submitEditedMessage}
            onEditKeyDown={handleEditKeyDown}
            className={
              isImmersive
                ? 'px-4 pt-5 sm:px-6 sm:pt-6 md:px-10 lg:px-14'
                : undefined
            }
            contentClassName={isImmersive ? 'gap-3' : undefined}
            emptyState={
              <div
                className={cn(
                  'text-center text-muted-foreground',
                  isImmersive ? 'px-2 py-10' : 'px-2 py-3'
                )}
              >
                <p className={cn(isImmersive ? 'text-base' : 'text-sm')}>
                  {t('chat.startConversation').replace(
                    '{type}',
                    contextType === 'source' ? t('navigation.sources') : t('common.project')
                  )}
                </p>
              </div>
            }
            footer={
              isStreaming ? (
                <>
                  {pendingToolCalls.length > 0 && (
                    <div className="space-y-1.5 px-0">
                      {pendingToolCalls.map((toolCall) => (
                        <ToolCallCard key={toolCall.id} toolCall={toolCall} />
                      ))}
                    </div>
                  )}
                  <AgentActivityStatus streamStatus={streamStatus} activityLog={activityLog} />
                </>
              ) : undefined
            }
          />

          {queue &&
          onPauseQueue &&
          onResumeQueue &&
          onEditQueueItem &&
          onDeleteQueueItem &&
          onRetryQueueItem &&
          onReorderQueue ? (
            <ChatQueuePanel
              queue={queue}
              onPause={onPauseQueue}
              onResume={onResumeQueue}
              onEditItem={onEditQueueItem}
              onDeleteItem={onDeleteQueueItem}
              onRetryItem={onRetryQueueItem}
              onReorder={onReorderQueue}
            />
          ) : null}

          {/* Source-chat context counts (compact inline meta) */}
          {contextIndicators && (
            <div className={cn(columnFooterClassName, 'flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground')}>
              {contextIndicators.sources?.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <FileText className="h-3 w-3" />
                  {contextIndicators.sources.length}
                </span>
              )}
              {contextIndicators.insights?.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Lightbulb className="h-3 w-3" />
                  {contextIndicators.insights.length}
                </span>
              )}
              {contextIndicators.notes?.length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <StickyNote className="h-3 w-3" />
                  {contextIndicators.notes.length}
                </span>
              )}
            </div>
          )}

          {projectContextStats && (
            <ContextIndicator
              sourcesInsights={projectContextStats.sourcesInsights}
              sourcesFull={projectContextStats.sourcesFull}
              notesCount={projectContextStats.notesCount}
              tokenCount={projectContextStats.tokenCount}
              charCount={projectContextStats.charCount}
            />
          )}

          {activeArtifact && onClearArtifact ? (
            <ActiveArtifactBar artifact={activeArtifact} onClear={onClearArtifact} />
          ) : null}

          {/* Input: model + composer on one compact strip */}
          <div
            className={cn(
              columnFooterClassName,
              isImmersive &&
                'border-border/60 px-4 py-3 sm:px-6 sm:py-4 md:px-10 lg:px-14'
            )}
          >
            {!input.trim() &&
            !composerBusy &&
            enableSuggestions &&
            (!suggestionsCollapsed || messages.length === 0) ? (
              <ChatSuggestionPills
                suggestions={suggestions}
                isLoading={suggestionsLoading}
                disabled={composerBusy}
                collapsed={suggestionsCollapsed}
                onCollapsedChange={setSuggestionsCollapsed}
                onSelect={handleSuggestionSelect}
              />
            ) : null}
            <div className={cn('flex min-w-0 items-end', isImmersive ? 'gap-2' : 'gap-1')}>
              {onModelChange && (
                <ChatModelOverrideDialog
                  currentModel={modelOverride}
                  onModelChange={onModelChange}
                  disabled={composerBusy}
                />
              )}
              {onSkillIdsChange && (
                <SkillPicker
                  selectedSkillIds={selectedSkillIds ?? []}
                  onChange={onSkillIdsChange}
                  disabled={composerBusy}
                />
              )}
              {onHtmlTemplateIdChange && (
                <TemplatePicker
                  selectedTemplateId={selectedHtmlTemplateId ?? null}
                  onChange={onHtmlTemplateIdChange}
                  disabled={composerBusy}
                />
              )}
              {onMcpToolIdsChange && (
                <ToolPicker
                  selectedToolIds={selectedMcpToolIds ?? []}
                  onChange={onMcpToolIdsChange}
                  disabled={composerBusy}
                />
              )}
              <Textarea
                id={chatInputId}
                name="chat-message"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeArtifact
                    ? `${t('chat.artifactSendPlaceholder')} (${keyHint})`
                    : t('chat.sendPlaceholder')
                }
                aria-label="chat-message"
                disabled={composerBusy}
                className={cn(
                  'max-h-[88px] flex-1 resize-none text-sm min-w-0',
                  isImmersive
                    ? 'min-h-[44px] rounded-xl px-3 py-2.5'
                    : 'min-h-[32px] px-2 py-[5px] leading-5'
                )}
                rows={1}
              />
              <Button
                onClick={() => void handleSend()}
                aria-label={t('chat.send')}
                disabled={!input.trim() || composerBusy}
                size="icon"
                className={cn(
                  'flex-shrink-0',
                  isImmersive ? 'h-11 w-11 rounded-xl' : 'h-8 w-8'
                )}
              >
                {composerBusy ? (
                  <InlineSkeleton />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

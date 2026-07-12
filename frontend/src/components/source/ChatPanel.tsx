'use client'

import { useState, useId, useMemo, useCallback, useEffect, useRef } from 'react'
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
import { ModelSelector } from './ModelSelector'
import { SkillPicker } from '@/components/skills/SkillPicker'
import { ToolPicker } from '@/components/mcp/ToolPicker'
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
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
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
  streamStatus?: string | null
  activityLog?: string[]
  contextIndicators: SourceChatContextIndicator | null
  onSendMessage: (message: string, modelOverride?: string) => void
  onEditMessage?: (messageId: string, content: string, modelOverride?: string) => void
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
  selectedSkillIds?: string[]
  onSkillIdsChange?: (ids: string[]) => void
  // MCP tools selection (transient per message)
  selectedMcpToolIds?: string[]
  onMcpToolIdsChange?: (ids: string[]) => void
  liveMcpToolCalls?: ChatToolCall[]
  activeArtifact?: Artifact
  onClearArtifact?: () => void
  noteSaveTitle?: string
}

export function ChatPanel({
  messages,
  isStreaming,
  streamStatus,
  activityLog = [],
  contextIndicators,
  onSendMessage,
  onEditMessage,
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
  selectedSkillIds,
  onSkillIdsChange,
  selectedMcpToolIds,
  onMcpToolIdsChange,
  liveMcpToolCalls = [],
  activeArtifact,
  onClearArtifact,
  noteSaveTitle,
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
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const { openModal } = useModalManager()

  useEffect(() => {
    if (!activeArtifact) {
      prefilledArtifactRef.current = null
      return
    }
    if (prefilledArtifactRef.current !== activeArtifact.id) {
      setInput(buildArtifactTriggerMessage(activeArtifact.title))
      prefilledArtifactRef.current = activeArtifact.id
    }
  }, [activeArtifact])

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
      if (isStreaming || !onEditMessage) return
      setEditingMessageId(messageId)
      setEditDraft(content)
    },
    [isStreaming, onEditMessage]
  )

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null)
    setEditDraft('')
  }, [])

  const submitEditedMessage = useCallback(() => {
    if (!editingMessageId || !editDraft.trim() || isStreaming || !onEditMessage) return
    onEditMessage(editingMessageId, editDraft.trim(), modelOverride)
    setEditingMessageId(null)
    setEditDraft('')
  }, [editDraft, editingMessageId, isStreaming, modelOverride, onEditMessage])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isMac =
        typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
      const isModifierPressed = isMac ? e.metaKey : e.ctrlKey

      if (e.key === 'Enter' && isModifierPressed) {
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

  const handleSend = () => {
    if (input.trim() && !isStreaming) {
      onSendMessage(input.trim(), modelOverride)
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
    const isModifierPressed = isMac ? e.metaKey : e.ctrlKey

    if (e.key === 'Enter' && isModifierPressed) {
      e.preventDefault()
      handleSend()
    }
  }

  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
  const keyHint = isMac ? '⌘+Enter' : 'Ctrl+Enter'
  const resolvedTitle =
    title ||
    (contextType === 'source'
      ? t('chat.chatWith').replace('{name}', t('navigation.sources'))
      : t('chat.chatWith').replace('{name}', t('common.project')))

  return (
    <>
      <Card className={columnCardClassName}>
        <ColumnHeader
          title={resolvedTitle}
          actions={
            onSelectSession && onCreateSession && onDeleteSession ? (
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
                <DialogContent className="p-0 overflow-hidden">
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
            saveAsArtifact={Boolean(activeArtifact)}
            toolCallsByMessageId={toolCallsByMessageId}
            canEdit={Boolean(onEditMessage)}
            editLocked={editingMessageId !== null}
            onReferenceClick={handleReferenceClick}
            onStartEdit={startEditingMessage}
            onEditDraftChange={setEditDraft}
            onCancelEdit={cancelEditingMessage}
            onSubmitEdit={submitEditedMessage}
            onEditKeyDown={handleEditKeyDown}
            emptyState={
              <div className="px-2 py-3 text-center text-muted-foreground">
                <p className="text-sm">
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
          <div className={columnFooterClassName}>
            <div className="flex items-end gap-1 min-w-0">
              {onModelChange && (
                <ModelSelector
                  currentModel={modelOverride}
                  onModelChange={onModelChange}
                  disabled={isStreaming}
                />
              )}
              {onSkillIdsChange && (
                <SkillPicker
                  selectedSkillIds={selectedSkillIds ?? []}
                  onChange={onSkillIdsChange}
                  disabled={isStreaming}
                />
              )}
              {onMcpToolIdsChange && (
                <ToolPicker
                  selectedToolIds={selectedMcpToolIds ?? []}
                  onChange={onMcpToolIdsChange}
                  disabled={isStreaming}
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
                    : `${t('chat.sendPlaceholder')} (${keyHint})`
                }
                disabled={isStreaming}
                className="min-h-[32px] max-h-[88px] flex-1 resize-none px-2 py-1 text-sm min-w-0"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="h-8 w-8 flex-shrink-0"
              >
                {isStreaming ? (
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

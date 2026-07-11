'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Send, Loader2, FileText, Lightbulb, StickyNote, Clock, Pencil } from 'lucide-react'
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  BaseChatSession
} from '@/lib/types/api'
import { ModelSelector } from './ModelSelector'
import { SkillPicker } from '@/components/skills/SkillPicker'
import { ContextIndicator } from '@/components/common/ContextIndicator'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { SessionManager } from '@/components/source/SessionManager'
import { MessageActions } from '@/components/source/MessageActions'
import { convertReferencesToCompactMarkdown, createCompactReferenceLinkComponent } from '@/lib/utils/source-references'
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
} from '@/components/notebooks/ColumnHeader'

interface NotebookContextStats {
  sourcesInsights: number
  sourcesFull: number
  notesCount: number
  tokenCount?: number
  charCount?: number
}

interface ChatPanelProps {
  messages: SourceChatMessage[]
  isStreaming: boolean
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
  contextType?: 'source' | 'notebook'
  // Notebook context stats (for notebook chat)
  notebookContextStats?: NotebookContextStats
  // Notebook ID for saving notes
  notebookId?: string
  // Skills selection for notebook chat
  selectedSkillIds?: string[]
  onSkillIdsChange?: (ids: string[]) => void
}

export function ChatPanel({
  messages,
  isStreaming,
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
  notebookContextStats,
  notebookId,
  selectedSkillIds,
  onSkillIdsChange,
}: ChatPanelProps) {
  const { t } = useTranslation()
  const chatInputId = useId()
  const [input, setInput] = useState('')
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { openModal } = useModalManager()

  const handleReferenceClick = (type: string, id: string) => {
    const modalType = type === 'source_insight' ? 'insight' : type as 'source' | 'note' | 'insight'

    try {
      openModal(modalType, id)
    } catch {
      toast.error(t('common.noResults'))
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const startEditingMessage = (messageId: string, content: string) => {
    if (isStreaming || !onEditMessage) {
      return
    }
    setEditingMessageId(messageId)
    setEditDraft(content)
  }

  const cancelEditingMessage = () => {
    setEditingMessageId(null)
    setEditDraft('')
  }

  const submitEditedMessage = () => {
    if (!editingMessageId || !editDraft.trim() || isStreaming || !onEditMessage) {
      return
    }
    onEditMessage(editingMessageId, editDraft.trim(), modelOverride)
    setEditingMessageId(null)
    setEditDraft('')
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
    const isModifierPressed = isMac ? e.metaKey : e.ctrlKey

    if (e.key === 'Enter' && isModifierPressed) {
      e.preventDefault()
      submitEditedMessage()
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditingMessage()
    }
  }

  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
  const keyHint = isMac ? '⌘+Enter' : 'Ctrl+Enter'
  const resolvedTitle =
    title ||
    (contextType === 'source'
      ? t('chat.chatWith').replace('{name}', t('navigation.sources'))
      : t('chat.chatWith').replace('{name}', t('common.notebook')))

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
                <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
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

        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          <ScrollArea className="flex-1 min-h-0 px-2" ref={scrollAreaRef}>
            <div className="flex flex-col gap-1.5 py-0">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-3 px-2">
                  <p className="text-sm">
                    {t('chat.startConversation').replace(
                      '{type}',
                      contextType === 'source' ? t('navigation.sources') : t('common.notebook')
                    )}
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'group flex',
                      message.type === 'human' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'flex max-w-[88%] flex-col gap-0.5',
                        message.type === 'human' ? 'items-end' : 'items-start'
                      )}
                    >
                      {message.type === 'human' && editingMessageId === message.id ? (
                        <div className="w-full min-w-[220px] rounded-lg border bg-background p-2 shadow-sm">
                          <Textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            disabled={isStreaming}
                            className="min-h-[72px] resize-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                            autoFocus
                          />
                          <div className="mt-2 flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={cancelEditingMessage}
                              disabled={isStreaming}
                            >
                              {t('common.cancel')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={submitEditedMessage}
                              disabled={!editDraft.trim() || isStreaming}
                            >
                              {t('chat.resend')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            className={cn(
                              'rounded-lg px-3 py-1.5',
                              message.type === 'human'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            )}
                          >
                            {message.type === 'ai' ? (
                              <AIMessageContent
                                content={message.content}
                                onReferenceClick={handleReferenceClick}
                              />
                            ) : (
                              <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                            )}
                          </div>
                          {message.type === 'human' && onEditMessage && (
                            <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                                onClick={() => startEditingMessage(message.id, message.content)}
                                disabled={isStreaming || editingMessageId !== null}
                                aria-label={t('chat.editMessage')}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                {t('chat.edit')}
                              </Button>
                            </div>
                          )}
                          {message.type === 'ai' && (
                            <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              <MessageActions
                                content={message.content}
                                notebookId={notebookId}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {isStreaming && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-3 py-1.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

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

          {notebookContextStats && (
            <ContextIndicator
              sourcesInsights={notebookContextStats.sourcesInsights}
              sourcesFull={notebookContextStats.sourcesFull}
              notesCount={notebookContextStats.notesCount}
              tokenCount={notebookContextStats.tokenCount}
              charCount={notebookContextStats.charCount}
            />
          )}

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
              <Textarea
                id={chatInputId}
                name="chat-message"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`${t('chat.sendPlaceholder')} (${keyHint})`}
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
                  <Loader2 className="h-4 w-4 animate-spin" />
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

function AIMessageContent({
  content,
  onReferenceClick
}: {
  content: string
  onReferenceClick: (type: string, id: string) => void
}) {
  const { t } = useTranslation()
  const markdownWithCompactRefs = convertReferencesToCompactMarkdown(content, t('common.references'))
  const LinkComponent = createCompactReferenceLinkComponent(onReferenceClick)

  return (
    <MarkdownRenderer
      size="sm"
      components={{ a: LinkComponent }}
    >
      {markdownWithCompactRefs}
    </MarkdownRenderer>
  )
}

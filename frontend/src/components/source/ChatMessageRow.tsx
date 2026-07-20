'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Pencil } from 'lucide-react'
import { SourceChatMessage } from '@/lib/types/api'
import { ChatToolCall } from '@/lib/types/mcp'
import { ToolCallGroup } from '@/components/mcp/ToolCallGroup'
import { MessageActions } from '@/components/source/MessageActions'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { TemplateHtmlPreview } from '@/components/templates/TemplateHtmlPreview'
import { A2uiMessageSurface } from '@/components/a2ui/A2uiMessageSurface'
import {
  convertReferencesToCompactMarkdown,
  createCompactReferenceLinkComponent,
} from '@/lib/utils/source-references'
import {
  extractHtmlFromChatContent,
  stripHtmlFromChatContent,
} from '@/lib/utils/extract-html-from-chat'
import { restoreTemplateMedia } from '@/lib/utils/restore-template-media'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useHtmlTemplate } from '@/lib/hooks/use-html-documents'
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'
import { useInlineA2uiFromContent } from '@/lib/a2ui/use-inline-a2ui'
import { cn } from '@/lib/utils'

const EMPTY_TOOL_CALLS: ChatToolCall[] = []

export interface ChatMessageRowProps {
  message: SourceChatMessage
  isStreamingThisMessage: boolean
  isEditing: boolean
  editDraft: string
  isStreaming: boolean
  projectId?: string
  noteSaveTitle?: string
  htmlTemplateId?: string | null
  toolCalls?: ChatToolCall[]
  canEdit: boolean
  editLocked: boolean
  onReferenceClick: (type: string, id: string) => void
  onStartEdit: (messageId: string, content: string) => void
  onEditDraftChange: (value: string) => void
  onCancelEdit: () => void
  onSubmitEdit: () => void
  onEditKeyDown: (e: React.KeyboardEvent) => void
}

function ChatMessageRowImpl({
  message,
  isStreamingThisMessage,
  isEditing,
  editDraft,
  isStreaming,
  projectId,
  noteSaveTitle,
  htmlTemplateId,
  toolCalls = EMPTY_TOOL_CALLS,
  canEdit,
  editLocked,
  onReferenceClick,
  onStartEdit,
  onEditDraftChange,
  onCancelEdit,
  onSubmitEdit,
  onEditKeyDown,
}: ChatMessageRowProps) {
  const { t } = useTranslation()
  const { data: htmlTemplate } = useHtmlTemplate(htmlTemplateId ?? undefined)
  const a2uiEnabled = isA2uiChatEnabled()
  const a2uiRevision = useA2uiSurfaceStore((state) => state.revision)
  const a2uiSurfaceCount = useA2uiSurfaceStore((state) =>
    message.type === 'ai' ? state.getSurfaceIdsForMessage(message.id).length : 0
  )
  const a2uiError = useA2uiSurfaceStore((state) =>
    message.type === 'ai' ? state.getErrorForMessage(message.id) : null
  )
  const displayContent = useInlineA2uiFromContent(message.id, message.content, {
    enabled: a2uiEnabled,
    isStreaming: isStreamingThisMessage,
    role: message.type === 'human' ? 'human' : 'ai',
  })
  const showA2uiSurface =
    a2uiEnabled &&
    message.type === 'ai' &&
    (a2uiSurfaceCount > 0 || Boolean(a2uiError))
  // A completed html_template_output event is safe to render immediately, even
  // while the surrounding text turn is still marked as streaming.
  const extractedRaw =
    message.type === 'ai' ? extractHtmlFromChatContent(message.content) : null
  const extractedHtml =
    extractedRaw && htmlTemplate?.html_body
      ? restoreTemplateMedia(extractedRaw, htmlTemplate.html_body)
      : extractedRaw
  const displayTextContent = extractedRaw
    ? stripHtmlFromChatContent(displayContent)
    : displayContent
  const showTemplatePreview = Boolean(extractedHtml)
  const showTemplateMissing =
    message.type === 'ai' &&
    Boolean(htmlTemplateId) &&
    !isStreamingThisMessage &&
    !extractedHtml
  const showMessageBody = Boolean(displayTextContent.trim())
  // Keep revision in render so memoized parents still refresh when surfaces update.
  void a2uiRevision

  return (
    <div
      data-index={message.id}
      className={cn(
        'group flex py-2 px-2',
        message.type === 'human' ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-0.5',
          message.type === 'human'
            ? 'max-w-[88%] items-end'
            : 'w-full max-w-[min(100%,52rem)] items-start'
        )}
      >
        {message.type === 'human' && isEditing ? (
          <div className="w-full min-w-[220px] rounded-lg border bg-background p-2 shadow-sm">
            <Textarea
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              onKeyDown={onEditKeyDown}
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
                onClick={onCancelEdit}
                disabled={isStreaming}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onSubmitEdit}
                disabled={!editDraft.trim() || isStreaming}
              >
                {t('chat.resend')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {showMessageBody ? (
              message.type === 'human' ? (
                <div className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {displayTextContent}
                  </p>
                </div>
              ) : (
                <div className="w-full min-w-0">
                  <AIMessageContent
                    content={displayTextContent}
                    isStreaming={isStreamingThisMessage}
                    onReferenceClick={onReferenceClick}
                  />
                </div>
              )
            ) : null}

            {showA2uiSurface ? (
              <div className="w-full pt-1" data-testid="chat-a2ui-output">
                <A2uiMessageSurface messageId={message.id} />
              </div>
            ) : null}

            {showTemplatePreview && extractedHtml ? (
              <div
                className="w-full space-y-2 pt-2"
                data-testid="chat-html-template-output"
              >
                <p className="text-xs text-muted-foreground">
                  {t('chat.templateStructuredOutput')}
                </p>
                <TemplateHtmlPreview html={extractedHtml} />
              </div>
            ) : showTemplateMissing ? (
              <div className="w-full space-y-2 pt-2">
                <p className="text-sm font-medium">
                  {t('chat.templateOutputMissing')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('chat.templateOutputMissingHint')}
                </p>
              </div>
            ) : null}

            {message.type === 'human' && canEdit && (
              <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] text-muted-foreground"
                  onClick={() => onStartEdit(message.id, displayTextContent)}
                  disabled={isStreaming || editLocked}
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
                  content={displayContent}
                  projectId={projectId}
                  noteTitle={noteSaveTitle}
                  htmlTemplateId={htmlTemplateId}
                />
              </div>
            )}
            {message.type === 'ai' && toolCalls.length > 0 && (
              <ToolCallGroup toolCalls={toolCalls} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function toolCallsEqual(a: ChatToolCall[], b: ChatToolCall[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].status !== b[i].status) return false
  }
  return true
}

function areChatMessageRowPropsEqual(
  prev: ChatMessageRowProps,
  next: ChatMessageRowProps
) {
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  if (prev.message.type !== next.message.type) return false
  if (prev.isStreamingThisMessage !== next.isStreamingThisMessage) return false
  if (prev.isStreaming !== next.isStreaming) return false
  if (prev.projectId !== next.projectId) return false
  if (prev.htmlTemplateId !== next.htmlTemplateId) return false
  if (prev.canEdit !== next.canEdit) return false
  if (prev.editLocked !== next.editLocked) return false
  if (
    !toolCallsEqual(
      prev.toolCalls ?? EMPTY_TOOL_CALLS,
      next.toolCalls ?? EMPTY_TOOL_CALLS
    )
  ) {
    return false
  }
  if (prev.isEditing !== next.isEditing) return false
  if (prev.isEditing && prev.editDraft !== next.editDraft) return false
  // A2UI surfaces live in an external store; always re-check AI rows.
  if (prev.message.type === 'ai' || next.message.type === 'ai') {
    return false
  }
  return true
}

export const ChatMessageRow = memo(
  ChatMessageRowImpl,
  areChatMessageRowPropsEqual
)

const AIMessageContent = memo(function AIMessageContent({
  content,
  isStreaming,
  onReferenceClick,
}: {
  content: string
  isStreaming: boolean
  onReferenceClick: (type: string, id: string) => void
}) {
  const { t } = useTranslation()

  if (isStreaming) {
    return <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
  }

  const markdownWithCompactRefs = convertReferencesToCompactMarkdown(
    content,
    t('common.references'),
    {
      source: t('common.source'),
      note: t('common.note'),
    }
  )
  const LinkComponent = createCompactReferenceLinkComponent(onReferenceClick)

  return (
    <MarkdownRenderer size="sm" components={{ a: LinkComponent }}>
      {markdownWithCompactRefs}
    </MarkdownRenderer>
  )
})

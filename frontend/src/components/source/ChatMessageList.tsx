'use client'

import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SourceChatMessage } from '@/lib/types/api'
import { ChatToolCall } from '@/lib/types/mcp'
import { ChatMessageRow, ChatMessageRowProps } from '@/components/source/ChatMessageRow'

const VIRTUALIZE_THRESHOLD = 40
const ESTIMATED_ROW_HEIGHT = 72

export interface ChatMessageListProps {
  messages: SourceChatMessage[]
  isStreaming: boolean
  streamingMessageId?: string
  editingMessageId: string | null
  editDraft: string
  projectId?: string
  toolCallsByMessageId: Map<string, ChatToolCall[]>
  canEdit: boolean
  editLocked: boolean
  onReferenceClick: (type: string, id: string) => void
  onStartEdit: (messageId: string, content: string) => void
  onEditDraftChange: (value: string) => void
  onCancelEdit: () => void
  onSubmitEdit: () => void
  onEditKeyDown: (e: React.KeyboardEvent) => void
  emptyState: React.ReactNode
  footer?: React.ReactNode
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamingMessageId,
  editingMessageId,
  editDraft,
  projectId,
  toolCallsByMessageId,
  canEdit,
  editLocked,
  onReferenceClick,
  onStartEdit,
  onEditDraftChange,
  onCancelEdit,
  onSubmitEdit,
  onEditKeyDown,
  emptyState,
  footer,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)
  const useVirtual = messages.length >= VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    enabled: useVirtual,
  })

  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (messages.length === 0) return
    if (!grew && !isStreaming) return

    if (useVirtual) {
      virtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: isStreaming ? 'auto' : 'smooth',
      })
    } else {
      messagesEndRef.current?.scrollIntoView({
        behavior: isStreaming ? 'auto' : 'smooth',
      })
    }
  }, [messages, isStreaming, useVirtual, virtualizer])

  const rowProps = (message: SourceChatMessage): ChatMessageRowProps => ({
    message,
    isStreamingThisMessage: message.id === streamingMessageId,
    isEditing: editingMessageId === message.id,
    editDraft,
    isStreaming,
    projectId,
    toolCalls: toolCallsByMessageId.get(message.id),
    canEdit,
    editLocked,
    onReferenceClick,
    onStartEdit,
    onEditDraftChange,
    onCancelEdit,
    onSubmitEdit,
    onEditKeyDown,
  })

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2">
        {emptyState}
        {footer}
        <div ref={messagesEndRef} />
      </div>
    )
  }

  if (!useVirtual) {
    return (
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2">
        <div className="flex flex-col gap-1.5 py-0">
          {messages.map((message) => (
            <ChatMessageRow key={message.id} {...rowProps(message)} />
          ))}
          {footer}
          <div ref={messagesEndRef} />
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2">
      <div
        className="relative w-full py-0"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index]
          return (
            <div
              key={message.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <ChatMessageRow {...rowProps(message)} />
            </div>
          )
        })}
      </div>
      {footer}
      <div ref={messagesEndRef} />
    </div>
  )
}

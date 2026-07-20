'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SourceChatMessage } from '@/lib/types/api'
import { ChatToolCall } from '@/lib/types/mcp'
import { ChatMessageRow, ChatMessageRowProps } from '@/components/source/ChatMessageRow'
import { cn } from '@/lib/utils'

const VIRTUALIZE_THRESHOLD = 40
const ESTIMATED_ROW_HEIGHT = 72
/** Distance from bottom that still counts as "pinned" for auto-scroll. */
const NEAR_BOTTOM_PX = 96

export interface ChatMessageListProps {
  messages: SourceChatMessage[]
  isStreaming: boolean
  streamingMessageId?: string
  editingMessageId: string | null
  editDraft: string
  /** When this changes, jump to the latest message (session switch / open). */
  sessionId?: string | null
  projectId?: string
  noteSaveTitle?: string
  htmlTemplateId?: string | null
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
  /** Extra classes on the scroll container (padding, spacing) */
  className?: string
  /** Extra classes on the message stack (e.g. top margin under header) */
  contentClassName?: string
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamingMessageId,
  editingMessageId,
  editDraft,
  sessionId = null,
  projectId,
  noteSaveTitle,
  htmlTemplateId,
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
  className,
  contentClassName,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)
  const prevLastMessageIdRef = useRef<string | undefined>(undefined)
  const prevSessionIdRef = useRef<string | null | undefined>(undefined)
  const stickyToBottomRef = useRef(true)
  const programmaticScrollRef = useRef(false)
  const pendingSessionScrollRef = useRef(false)
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const useVirtual = messages.length >= VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    enabled: useVirtual,
  })

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
  }, [])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      const el = scrollRef.current
      if (!el) return

      programmaticScrollRef.current = true
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current)
      }
      // Smooth scroll emits intermediate events; ignore them until settled.
      programmaticScrollTimerRef.current = setTimeout(
        () => {
          programmaticScrollRef.current = false
          stickyToBottomRef.current = isNearBottom()
        },
        behavior === 'smooth' ? 400 : 50
      )

      if (useVirtual) {
        virtualizer.scrollToIndex(Math.max(messages.length - 1, 0), {
          align: 'end',
          behavior,
        })
      }

      // Always scroll the container itself so footers / streaming status stay in view.
      if (behavior === 'smooth') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    },
    [isNearBottom, messages.length, useVirtual, virtualizer]
  )

  // Track whether the user is pinned near the bottom (manual scroll up disables auto-scroll).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onScroll = () => {
      if (programmaticScrollRef.current) return
      stickyToBottomRef.current = isNearBottom()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isNearBottom, messages.length])

  useEffect(() => {
    return () => {
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current)
      }
    }
  }, [])

  // Session open / switch: always pin and jump to the latest message (retry when history loads).
  useLayoutEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId
      stickyToBottomRef.current = true
      prevMessageCountRef.current = 0
      prevLastMessageIdRef.current = undefined
      pendingSessionScrollRef.current = true
    }

    if (!pendingSessionScrollRef.current || messages.length === 0) return

    pendingSessionScrollRef.current = false
    scrollToBottom('auto')
    const frame = requestAnimationFrame(() => {
      scrollToBottom('auto')
      requestAnimationFrame(() => scrollToBottom('auto'))
    })
    return () => cancelAnimationFrame(frame)
  }, [sessionId, messages, scrollToBottom])

  useEffect(() => {
    const lastMessageId = messages[messages.length - 1]?.id
    const grew = messages.length > prevMessageCountRef.current
    const lastChanged = lastMessageId !== prevLastMessageIdRef.current
    prevMessageCountRef.current = messages.length
    prevLastMessageIdRef.current = lastMessageId

    if (messages.length === 0) {
      stickyToBottomRef.current = true
      return
    }

    // New or replaced messages (send / session switch) re-pin to the bottom.
    if (grew || lastChanged) {
      stickyToBottomRef.current = true
    }

    if (!stickyToBottomRef.current) return
    if (!grew && !lastChanged && !isStreaming) return

    // Instant jump for streaming and long histories; smooth only for short appends.
    const behavior: ScrollBehavior =
      isStreaming || grew || messages.length >= VIRTUALIZE_THRESHOLD
        ? 'auto'
        : 'smooth'

    scrollToBottom(behavior)
  }, [messages, isStreaming, scrollToBottom])

  const rowProps = (message: SourceChatMessage): ChatMessageRowProps => ({
    message,
    isStreamingThisMessage: message.id === streamingMessageId,
    isEditing: editingMessageId === message.id,
    editDraft,
    isStreaming,
    projectId,
    noteSaveTitle,
    htmlTemplateId,
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

  const scrollClassName = cn(
    'flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2',
    className
  )

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className={scrollClassName}>
        <div className={cn(contentClassName)}>{emptyState}</div>
        {footer}
        <div ref={messagesEndRef} />
      </div>
    )
  }

  if (!useVirtual) {
    return (
      <div ref={scrollRef} className={scrollClassName}>
        <div className={cn('flex flex-col gap-1.5 py-0', contentClassName)}>
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
    <div ref={scrollRef} className={scrollClassName}>
      <div
        className={cn('relative w-full py-0', contentClassName)}
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

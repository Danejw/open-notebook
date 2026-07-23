'use client'

import { useMemo, useState, useCallback, type MutableRefObject } from 'react'
import { SourceChatMessage } from '@/lib/types/api'
import { ChatToolCall } from '@/lib/types/mcp'
import { ToolCallGroup } from '@/components/mcp/ToolCallGroup'
import { ChatMessageList } from '@/components/source/ChatMessageList'
import { AgentActivityStatus } from '@/components/common/AgentActivityStatus'
import { EmptyState } from '@/components/common/EmptyState'
import { useMcpSessionToolCalls } from '@/lib/hooks/use-mcp'
import {
  groupToolCallsByMessage,
  mergeMcpToolCalls,
} from '@/lib/ag-ui/mcp-tool-calls'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useCitationFocusStore } from '@/lib/stores/citation-focus-store'
import { toast } from 'sonner'

export interface ChatPanelMessagesProps {
  messages: SourceChatMessage[]
  isStreaming: boolean
  streamStatus?: string | null
  activityLog?: string[]
  currentSessionId?: string | null
  projectId?: string
  noteSaveTitle?: string
  htmlTemplateId?: string | null
  liveMcpToolCalls?: ChatToolCall[]
  onEditMessage?: (messageId: string, content: string, modelOverride?: string) => void
  historyEditDisabled?: boolean
  modelOverride?: string
  contextType?: 'source' | 'project'
  variant?: 'column' | 'immersive'
  onNearBottomChange?: (nearBottom: boolean) => void
  scrollToBottomRef?: MutableRefObject<(() => void) | null>
}

export function ChatPanelMessages({
  messages,
  isStreaming,
  streamStatus,
  activityLog = [],
  currentSessionId,
  projectId,
  noteSaveTitle,
  htmlTemplateId,
  liveMcpToolCalls = [],
  onEditMessage,
  historyEditDisabled,
  modelOverride,
  contextType = 'project',
  variant = 'column',
  onNearBottomChange,
  scrollToBottomRef,
}: ChatPanelMessagesProps) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()
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

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const historyEditLocked = historyEditDisabled ?? isStreaming

  const handleReferenceClick = useCallback(
    (type: string, id: string) => {
      if (type !== 'source' && type !== 'note') {
        return
      }

      try {
        if (type === 'source') {
          useCitationFocusStore.getState().openWithFocus(id)
        }
        openModal(type, id)
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
    ) {
      return
    }
    onEditMessage(editingMessageId, editDraft.trim(), modelOverride)
    setEditingMessageId(null)
    setEditDraft('')
  }, [editDraft, editingMessageId, historyEditLocked, modelOverride, onEditMessage])

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

  const isImmersive = variant === 'immersive'

  return (
    <ChatMessageList
      messages={messages}
      isStreaming={isStreaming}
      streamingMessageId={streamingMessageId}
      editingMessageId={editingMessageId}
      editDraft={editDraft}
      sessionId={currentSessionId}
      projectId={projectId}
      noteSaveTitle={noteSaveTitle}
      htmlTemplateId={htmlTemplateId ?? null}
      toolCallsByMessageId={toolCallsByMessageId}
      canEdit={Boolean(onEditMessage)}
      editLocked={editingMessageId !== null}
      onReferenceClick={handleReferenceClick}
      onStartEdit={startEditingMessage}
      onEditDraftChange={setEditDraft}
      onCancelEdit={cancelEditingMessage}
      onSubmitEdit={submitEditedMessage}
      onEditKeyDown={handleEditKeyDown}
      onNearBottomChange={onNearBottomChange}
      scrollToBottomRef={scrollToBottomRef}
      className={
        isImmersive ? 'px-4 pt-5 sm:px-6 sm:pt-6 md:px-10 lg:px-14' : undefined
      }
      contentClassName={isImmersive ? 'gap-3' : undefined}
      emptyState={
        <EmptyState
          variant="subtle"
          title={t('chat.startConversation').replace(
            '{type}',
            contextType === 'source' ? t('navigation.sources') : t('common.project')
          )}
          className={isImmersive ? 'px-2 py-10' : 'px-2 py-3'}
          titleClassName={isImmersive ? 'text-base' : undefined}
        />
      }
      footer={
        isStreaming ? (
          <>
            {pendingToolCalls.length > 0 && (
              <ToolCallGroup toolCalls={pendingToolCalls} />
            )}
            <AgentActivityStatus streamStatus={streamStatus} activityLog={activityLog} />
          </>
        ) : undefined
      }
    />
  )
}

import type { ChatPanelProps } from '@/components/source/ChatPanel'
import type { useProjectChat } from '@/lib/hooks/useProjectChat'
import type { useSourceChat } from '@/lib/hooks/useSourceChat'

type ProjectChat = ReturnType<typeof useProjectChat>
type SourceChat = ReturnType<typeof useSourceChat>

type ProjectChatPanelOverrides = Partial<ChatPanelProps>
type SourceChatPanelOverrides = Partial<ChatPanelProps>

/** Maps full project chat hook state to ChatPanel props (dashboard ChatColumn). */
export function bindProjectChatPanelProps(
  chat: ProjectChat,
  overrides: ProjectChatPanelOverrides = {}
): ChatPanelProps {
  return {
    contextType: 'project',
    contextIndicators: null,
    messages: chat.messages,
    isStreaming: chat.isSending,
    isDirectStreaming: chat.isDirectSending,
    streamStatus: chat.streamStatus,
    activityLog: chat.activityLog,
    onSendMessage: (message, modelOverride) => chat.sendMessage(message, modelOverride),
    onEnqueueMessage: chat.enqueueMessage,
    onEditMessage: (messageId, content, modelOverride) =>
      chat.editAndResend(messageId, content, modelOverride),
    historyEditDisabled: chat.queueHasWork,
    queue: chat.queue,
    onPauseQueue: chat.pauseQueue,
    onResumeQueue: chat.resumeQueue,
    onEditQueueItem: chat.editQueueItem,
    onDeleteQueueItem: chat.deleteQueueItem,
    onRetryQueueItem: chat.retryQueueItem,
    onReorderQueue: chat.reorderQueue,
    modelOverride:
      chat.currentSession?.model_override ??
      chat.pendingModelOverride ??
      undefined,
    onModelChange: (model) => chat.setModelOverride(model ?? null),
    selectedSkillIds: chat.selectedSkillIds,
    onSkillIdsChange: chat.setSelectedSkillIds,
    selectedHtmlTemplateId: chat.selectedHtmlTemplateId,
    onHtmlTemplateIdChange: chat.setSelectedHtmlTemplateId,
    selectedMcpToolIds: chat.selectedMcpToolIds,
    onMcpToolIdsChange: chat.setSelectedMcpToolIds,
    liveMcpToolCalls: chat.liveMcpToolCalls,
    sessions: chat.sessions,
    currentSessionId: chat.currentSessionId,
    onCreateSession: (title) => chat.createSession(title),
    onSelectSession: chat.switchSession,
    onUpdateSession: (sessionId, title) => chat.updateSession(sessionId, { title }),
    onDeleteSession: chat.deleteSession,
    loadingSessions: chat.loadingSessions,
    ...overrides,
  }
}

/** Maps shared (guest) project chat hook state to a reduced ChatPanel prop set. */
export function bindSharedProjectChatPanelProps(
  chat: ProjectChat,
  overrides: ProjectChatPanelOverrides = {}
): ChatPanelProps {
  return {
    contextType: 'project',
    contextIndicators: null,
    messages: chat.messages,
    isStreaming: chat.isSending,
    streamStatus: chat.streamStatus,
    activityLog: chat.activityLog,
    onSendMessage: (message) => {
      void chat.sendMessage(message)
    },
    onEditMessage: (messageId, content) => {
      void chat.editAndResend(messageId, content)
    },
    currentSessionId: chat.currentSessionId,
    loadingSessions: chat.loadingSessions,
    ...overrides,
  }
}

/** Maps source chat hook state to ChatPanel props (source detail page). */
export function bindSourceChatPanelProps(
  chat: SourceChat,
  overrides: SourceChatPanelOverrides = {}
): ChatPanelProps {
  return {
    messages: chat.messages,
    isStreaming: chat.isStreaming,
    isDirectStreaming: chat.isDirectSending,
    streamStatus: chat.streamStatus,
    activityLog: chat.activityLog,
    contextIndicators: chat.contextIndicators,
    onSendMessage: (message, model) => chat.sendMessage(message, model),
    onEnqueueMessage: chat.enqueueMessage,
    queue: chat.queue,
    onPauseQueue: chat.pauseQueue,
    onResumeQueue: chat.resumeQueue,
    onEditQueueItem: chat.editQueueItem,
    onDeleteQueueItem: chat.deleteQueueItem,
    onRetryQueueItem: chat.retryQueueItem,
    onReorderQueue: chat.reorderQueue,
    modelOverride: chat.currentSession?.model_override,
    onModelChange: (model) => {
      if (chat.currentSessionId) {
        chat.updateSession(chat.currentSessionId, { model_override: model })
      }
    },
    selectedSkillIds: chat.selectedSkillIds,
    onSkillIdsChange: chat.setSelectedSkillIds,
    selectedHtmlTemplateId: chat.selectedHtmlTemplateId,
    onHtmlTemplateIdChange: chat.setSelectedHtmlTemplateId,
    selectedMcpToolIds: chat.selectedMcpToolIds,
    onMcpToolIdsChange: chat.setSelectedMcpToolIds,
    liveMcpToolCalls: chat.liveMcpToolCalls,
    sessions: chat.sessions,
    currentSessionId: chat.currentSessionId,
    onCreateSession: (title) => chat.createSession({ title }),
    onSelectSession: chat.switchSession,
    onUpdateSession: (sessionId, title) => chat.updateSession(sessionId, { title }),
    onDeleteSession: chat.deleteSession,
    loadingSessions: chat.loadingSessions,
    ...overrides,
  }
}

import type { ChatPanelProps } from '@/components/source/ChatPanel'
import type { useProjectChat } from '@/lib/hooks/useProjectChat'

type ProjectChat = ReturnType<typeof useProjectChat>

type ProjectChatPanelOverrides = Partial<ChatPanelProps>

type CommonChatPanelFields = Pick<
  ChatPanelProps,
  | 'messages'
  | 'streamStatus'
  | 'activityLog'
  | 'onEnqueueMessage'
  | 'queue'
  | 'onPauseQueue'
  | 'onResumeQueue'
  | 'onEditQueueItem'
  | 'onDeleteQueueItem'
  | 'onRetryQueueItem'
  | 'onReorderQueue'
  | 'queueStreamError'
  | 'onRetryQueueStream'
  | 'selectedSkillIds'
  | 'onSkillIdsChange'
  | 'selectedCollectionIds'
  | 'onCollectionIdsChange'
  | 'selectedHtmlTemplateId'
  | 'onHtmlTemplateIdChange'
  | 'selectedMcpToolIds'
  | 'onMcpToolIdsChange'
  | 'liveMcpToolCalls'
  | 'sessions'
  | 'currentSessionId'
  | 'onSelectSession'
  | 'onDeleteSession'
  | 'loadingSessions'
>

type CommonChatRuntime = {
  messages: ChatPanelProps['messages']
  streamStatus: ChatPanelProps['streamStatus']
  activityLog: ChatPanelProps['activityLog']
  enqueueMessage: NonNullable<ChatPanelProps['onEnqueueMessage']>
  queue: ChatPanelProps['queue']
  pauseQueue: NonNullable<ChatPanelProps['onPauseQueue']>
  resumeQueue: NonNullable<ChatPanelProps['onResumeQueue']>
  editQueueItem: NonNullable<ChatPanelProps['onEditQueueItem']>
  deleteQueueItem: NonNullable<ChatPanelProps['onDeleteQueueItem']>
  retryQueueItem: NonNullable<ChatPanelProps['onRetryQueueItem']>
  reorderQueue: NonNullable<ChatPanelProps['onReorderQueue']>
  queueStreamError?: ChatPanelProps['queueStreamError']
  retryQueueStream?: ChatPanelProps['onRetryQueueStream']
  selectedSkillIds: NonNullable<ChatPanelProps['selectedSkillIds']>
  setSelectedSkillIds: NonNullable<ChatPanelProps['onSkillIdsChange']>
  selectedCollectionIds: NonNullable<ChatPanelProps['selectedCollectionIds']>
  setSelectedCollectionIds: NonNullable<ChatPanelProps['onCollectionIdsChange']>
  selectedHtmlTemplateId: ChatPanelProps['selectedHtmlTemplateId']
  setSelectedHtmlTemplateId: NonNullable<ChatPanelProps['onHtmlTemplateIdChange']>
  selectedMcpToolIds: NonNullable<ChatPanelProps['selectedMcpToolIds']>
  setSelectedMcpToolIds: NonNullable<ChatPanelProps['onMcpToolIdsChange']>
  liveMcpToolCalls: ChatPanelProps['liveMcpToolCalls']
  sessions: ChatPanelProps['sessions']
  currentSessionId: ChatPanelProps['currentSessionId']
  switchSession: NonNullable<ChatPanelProps['onSelectSession']>
  deleteSession: NonNullable<ChatPanelProps['onDeleteSession']>
  loadingSessions: ChatPanelProps['loadingSessions']
}

/** Shared queue / skill / MCP / session fields used by project chat binders. */
export function bindCommonChatPanelProps(chat: CommonChatRuntime): CommonChatPanelFields {
  return {
    messages: chat.messages,
    streamStatus: chat.streamStatus,
    activityLog: chat.activityLog,
    onEnqueueMessage: chat.enqueueMessage,
    queue: chat.queue,
    onPauseQueue: chat.pauseQueue,
    onResumeQueue: chat.resumeQueue,
    onEditQueueItem: chat.editQueueItem,
    onDeleteQueueItem: chat.deleteQueueItem,
    onRetryQueueItem: chat.retryQueueItem,
    onReorderQueue: chat.reorderQueue,
    queueStreamError: chat.queueStreamError ?? null,
    onRetryQueueStream: chat.retryQueueStream,
    selectedSkillIds: chat.selectedSkillIds,
    onSkillIdsChange: chat.setSelectedSkillIds,
    selectedCollectionIds: chat.selectedCollectionIds,
    onCollectionIdsChange: chat.setSelectedCollectionIds,
    selectedHtmlTemplateId: chat.selectedHtmlTemplateId,
    onHtmlTemplateIdChange: chat.setSelectedHtmlTemplateId,
    selectedMcpToolIds: chat.selectedMcpToolIds,
    onMcpToolIdsChange: chat.setSelectedMcpToolIds,
    liveMcpToolCalls: chat.liveMcpToolCalls,
    sessions: chat.sessions,
    currentSessionId: chat.currentSessionId,
    onSelectSession: chat.switchSession,
    onDeleteSession: chat.deleteSession,
    loadingSessions: chat.loadingSessions,
  }
}

/** Maps full project chat hook state to ChatPanel props (dashboard ChatColumn). */
export function bindProjectChatPanelProps(
  chat: ProjectChat,
  overrides: ProjectChatPanelOverrides = {}
): ChatPanelProps {
  return {
    ...bindCommonChatPanelProps(chat),
    contextType: 'project',
    contextIndicators: null,
    isStreaming: chat.isSending,
    isDirectStreaming: chat.isDirectSending,
    onSendMessage: (message, modelOverride) => chat.sendMessage(message, modelOverride),
    onEditMessage: (messageId, content, modelOverride) =>
      chat.editAndResend(messageId, content, modelOverride),
    historyEditDisabled: chat.queueHasWork,
    modelOverride:
      chat.currentSession?.model_override ??
      chat.pendingModelOverride ??
      undefined,
    onModelChange: (model) => chat.setModelOverride(model ?? null),
    onCreateSession: (title) => chat.createSession(title),
    onUpdateSession: (sessionId, title) => chat.updateSession(sessionId, { title }),
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

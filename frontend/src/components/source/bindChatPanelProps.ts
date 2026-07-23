import type {
  ChatPanelContextSelection,
  ChatPanelProps,
  ChatPanelQueueControls,
  ChatPanelSessionControls,
  ChatPanelStreamingState,
} from '@/components/source/ChatPanel'
import type { useProjectChat } from '@/lib/hooks/useProjectChat'

type ProjectChat = ReturnType<typeof useProjectChat>

type ProjectChatPanelOverrides = Partial<
  Omit<
    ChatPanelProps,
    'streaming' | 'sessionControls' | 'contextSelection' | 'queueControls'
  >
> & {
  streaming?: Partial<ChatPanelStreamingState>
  sessionControls?: Partial<ChatPanelSessionControls>
  contextSelection?: Partial<ChatPanelContextSelection>
  queueControls?: Partial<ChatPanelQueueControls>
}

type CommonChatRuntime = {
  messages: ChatPanelStreamingState['messages']
  streamStatus: ChatPanelStreamingState['streamStatus']
  activityLog: ChatPanelStreamingState['activityLog']
  enqueueMessage: NonNullable<ChatPanelStreamingState['onEnqueueMessage']>
  queue: ChatPanelQueueControls['queue']
  pauseQueue: NonNullable<ChatPanelQueueControls['onPauseQueue']>
  resumeQueue: NonNullable<ChatPanelQueueControls['onResumeQueue']>
  editQueueItem: NonNullable<ChatPanelQueueControls['onEditQueueItem']>
  deleteQueueItem: NonNullable<ChatPanelQueueControls['onDeleteQueueItem']>
  retryQueueItem: NonNullable<ChatPanelQueueControls['onRetryQueueItem']>
  reorderQueue: NonNullable<ChatPanelQueueControls['onReorderQueue']>
  queueStreamError?: ChatPanelQueueControls['queueStreamError']
  retryQueueStream?: ChatPanelQueueControls['onRetryQueueStream']
  selectedSkillIds: NonNullable<ChatPanelContextSelection['selectedSkillIds']>
  setSelectedSkillIds: NonNullable<ChatPanelContextSelection['onSkillIdsChange']>
  selectedCollectionIds: NonNullable<
    ChatPanelContextSelection['selectedCollectionIds']
  >
  setSelectedCollectionIds: NonNullable<
    ChatPanelContextSelection['onCollectionIdsChange']
  >
  selectedHtmlTemplateId: ChatPanelContextSelection['selectedHtmlTemplateId']
  setSelectedHtmlTemplateId: NonNullable<
    ChatPanelContextSelection['onHtmlTemplateIdChange']
  >
  selectedMcpToolIds: NonNullable<ChatPanelContextSelection['selectedMcpToolIds']>
  setSelectedMcpToolIds: NonNullable<
    ChatPanelContextSelection['onMcpToolIdsChange']
  >
  liveMcpToolCalls: ChatPanelContextSelection['liveMcpToolCalls']
  sessions: ChatPanelSessionControls['sessions']
  currentSessionId: ChatPanelSessionControls['currentSessionId']
  switchSession: NonNullable<ChatPanelSessionControls['onSelectSession']>
  deleteSession: NonNullable<ChatPanelSessionControls['onDeleteSession']>
  loadingSessions: ChatPanelSessionControls['loadingSessions']
}

function bindCommonChatPanelBags(chat: CommonChatRuntime): {
  streaming: Pick<
    ChatPanelStreamingState,
    'messages' | 'streamStatus' | 'activityLog' | 'onEnqueueMessage'
  >
  sessionControls: ChatPanelSessionControls
  contextSelection: ChatPanelContextSelection
  queueControls: ChatPanelQueueControls
} {
  return {
    streaming: {
      messages: chat.messages,
      streamStatus: chat.streamStatus,
      activityLog: chat.activityLog,
      onEnqueueMessage: chat.enqueueMessage,
    },
    sessionControls: {
      sessions: chat.sessions,
      currentSessionId: chat.currentSessionId,
      onSelectSession: chat.switchSession,
      onDeleteSession: chat.deleteSession,
      loadingSessions: chat.loadingSessions,
    },
    contextSelection: {
      selectedSkillIds: chat.selectedSkillIds,
      onSkillIdsChange: chat.setSelectedSkillIds,
      selectedCollectionIds: chat.selectedCollectionIds,
      onCollectionIdsChange: chat.setSelectedCollectionIds,
      selectedHtmlTemplateId: chat.selectedHtmlTemplateId,
      onHtmlTemplateIdChange: chat.setSelectedHtmlTemplateId,
      selectedMcpToolIds: chat.selectedMcpToolIds,
      onMcpToolIdsChange: chat.setSelectedMcpToolIds,
      liveMcpToolCalls: chat.liveMcpToolCalls,
    },
    queueControls: {
      queue: chat.queue,
      onPauseQueue: chat.pauseQueue,
      onResumeQueue: chat.resumeQueue,
      onEditQueueItem: chat.editQueueItem,
      onDeleteQueueItem: chat.deleteQueueItem,
      onRetryQueueItem: chat.retryQueueItem,
      onReorderQueue: chat.reorderQueue,
      queueStreamError: chat.queueStreamError ?? null,
      onRetryQueueStream: chat.retryQueueStream,
    },
  }
}

/** Maps full project chat hook state to ChatPanel props (dashboard ChatColumn). */
export function bindProjectChatPanelProps(
  chat: ProjectChat,
  overrides: ProjectChatPanelOverrides = {}
): ChatPanelProps {
  const bags = bindCommonChatPanelBags(chat)
  const {
    streaming: streamingOverrides,
    sessionControls: sessionOverrides,
    contextSelection: contextOverrides,
    queueControls: queueOverrides,
    ...layoutOverrides
  } = overrides

  return {
    contextType: 'project',
    contextIndicators: null,
    streaming: {
      ...bags.streaming,
      isStreaming: chat.isSending,
      isDirectStreaming: chat.isDirectSending,
      onSendMessage: (message, modelOverride) =>
        chat.sendMessage(message, modelOverride),
      onEditMessage: (messageId, content, modelOverride) =>
        chat.editAndResend(messageId, content, modelOverride),
      historyEditDisabled: chat.queueHasWork,
      modelOverride:
        chat.currentSession?.model_override ??
        chat.pendingModelOverride ??
        undefined,
      onModelChange: (model) => chat.setModelOverride(model ?? null),
      ...streamingOverrides,
    },
    sessionControls: {
      ...bags.sessionControls,
      onCreateSession: (title) => chat.createSession(title),
      onUpdateSession: (sessionId, title) =>
        chat.updateSession(sessionId, { title }),
      ...sessionOverrides,
    },
    contextSelection: {
      ...bags.contextSelection,
      ...contextOverrides,
    },
    queueControls: {
      ...bags.queueControls,
      ...queueOverrides,
    },
    ...layoutOverrides,
  }
}

/** Maps shared (guest) project chat hook state to a reduced ChatPanel prop set. */
export function bindSharedProjectChatPanelProps(
  chat: ProjectChat,
  overrides: ProjectChatPanelOverrides = {}
): ChatPanelProps {
  const {
    streaming: streamingOverrides,
    sessionControls: sessionOverrides,
    contextSelection: contextOverrides,
    queueControls: queueOverrides,
    ...layoutOverrides
  } = overrides

  return {
    contextType: 'project',
    contextIndicators: null,
    streaming: {
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
      ...streamingOverrides,
    },
    sessionControls: {
      currentSessionId: chat.currentSessionId,
      loadingSessions: chat.loadingSessions,
      ...sessionOverrides,
    },
    contextSelection: contextOverrides,
    queueControls: queueOverrides,
    ...layoutOverrides,
  }
}

'use client'

import { useState, useId, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square } from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import {
  ChatComposerAttachMenu,
  openChatAttachPicker,
  type ChatAttachPicker,
} from '@/components/source/ChatComposerAttachMenu'
import { ChatComposerSelectionIndicators } from '@/components/source/ChatComposerSelectionIndicators'
import { ChatSuggestionPills } from '@/components/source/ChatSuggestionPills'
import { useChatSuggestions } from '@/lib/hooks/useChatSuggestions'
import { useChatUiStore } from '@/lib/stores/chat-ui-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { columnFooterClassName } from '@/components/projects/ColumnHeader'
import {
  buildArtifactTriggerMessage,
} from '@/components/projects/ActiveArtifactBar'
import type { Artifact } from '@/lib/types/artifacts'
import type { ChatQueueResponse } from '@/lib/types/chat-queue'
import { shouldDeferChatToQueue } from '@/lib/types/chat-queue'
import { cn } from '@/lib/utils'

export interface ChatComposerProps {
  variant?: 'column' | 'immersive'
  isStreaming: boolean
  isDirectStreaming?: boolean
  composerDisabled?: boolean
  onCancelStreaming?: () => void
  onSendMessage: (message: string, modelOverride?: string) => void
  onEnqueueMessage?: (
    message: string,
    options: {
      modelOverride?: string
      loopCount: number
      scheduleRunner?: boolean
    }
  ) => void | Promise<unknown>
  modelOverride?: string
  onModelChange?: (model?: string) => void
  selectedSkillIds?: string[]
  onSkillIdsChange?: (ids: string[]) => void
  selectedCollectionIds?: string[]
  onCollectionIdsChange?: (ids: string[]) => void
  selectedHtmlTemplateId?: string | null
  onHtmlTemplateIdChange?: (id: string | null) => void
  selectedMcpToolIds?: string[]
  onMcpToolIdsChange?: (ids: string[]) => void
  activeArtifact?: Artifact
  /** Bumps when the user clicks an artifact so the trigger prompt is re-prefilled. */
  artifactPrefillKey?: number
  enableSuggestions?: boolean
  contextType?: 'source' | 'project'
  projectId?: string
  sourceId?: string
  guestKey?: string | null
  currentSessionId?: string | null
  messageCount: number
  queue?: ChatQueueResponse
  showJumpToBottom?: boolean
  onJumpToBottom?: () => void
}

export function ChatComposer({
  variant = 'column',
  isStreaming,
  isDirectStreaming = false,
  composerDisabled = false,
  onSendMessage,
  onEnqueueMessage,
  onCancelStreaming,
  modelOverride,
  onModelChange,
  selectedSkillIds,
  onSkillIdsChange,
  selectedCollectionIds,
  onCollectionIdsChange,
  selectedHtmlTemplateId,
  onHtmlTemplateIdChange,
  selectedMcpToolIds,
  onMcpToolIdsChange,
  activeArtifact,
  artifactPrefillKey = 0,
  enableSuggestions = true,
  contextType = 'source',
  projectId,
  sourceId,
  guestKey = null,
  currentSessionId,
  messageCount,
  queue,
  showJumpToBottom = false,
  onJumpToBottom,
}: ChatComposerProps) {
  const { t } = useTranslation()
  const chatInputId = useId()
  const [input, setInput] = useState('')
  const [activePicker, setActivePicker] = useState<ChatAttachPicker>(null)
  const prefilledArtifactRef = useRef<string | null>(null)

  const queueMode = Boolean(onEnqueueMessage)
  const deferToQueue = shouldDeferChatToQueue(isStreaming, queue)
  const composerBusy = !queueMode && (composerDisabled || isStreaming)
  const showStopStreaming =
    Boolean(onCancelStreaming) && isDirectStreaming && !deferToQueue

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
    messageCount,
    enabled: enableSuggestions && !suggestionsCollapsed,
    guestKey,
  })

  const submitMessage = useCallback(
    async (message: string) => {
      if (onEnqueueMessage && deferToQueue) {
        // Never schedule the worker runner — client drains via sendMessage.
        await onEnqueueMessage(message, {
          loopCount: 1,
          modelOverride,
          scheduleRunner: false,
        })
        return
      }
      onSendMessage(message, modelOverride)
    },
    [deferToQueue, modelOverride, onEnqueueMessage, onSendMessage]
  )

  // Prefill the trigger prompt when an artifact is selected; do not auto-send so
  // skills / tools / template from the artifact can be applied first.
  useEffect(() => {
    if (!activeArtifact) {
      prefilledArtifactRef.current = null
      return
    }
    const prefillToken = `${activeArtifact.id}:${artifactPrefillKey}`
    if (prefilledArtifactRef.current !== prefillToken) {
      setInput(buildArtifactTriggerMessage(activeArtifact.title))
      prefilledArtifactRef.current = prefillToken
    }
  }, [activeArtifact, artifactPrefillKey])

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

  const isImmersive = variant === 'immersive'
  return (
    <div
      className={cn(
        columnFooterClassName,
        'border-t-0',
        isImmersive &&
          'border-border/60 px-4 py-3 sm:px-6 sm:py-4 md:px-10 lg:px-14'
      )}
    >
      {!input.trim() &&
      !composerBusy &&
      enableSuggestions &&
      (!suggestionsCollapsed || messageCount === 0) ? (
        <ChatSuggestionPills
          suggestions={suggestions}
          isLoading={suggestionsLoading}
          disabled={composerBusy}
          collapsed={suggestionsCollapsed}
          onCollapsedChange={setSuggestionsCollapsed}
          onSelect={handleSuggestionSelect}
        />
      ) : null}
      <ChatComposerSelectionIndicators
        disabled={composerBusy}
        modelOverride={modelOverride}
        onModelChange={onModelChange}
        selectedSkillIds={selectedSkillIds}
        onSkillIdsChange={onSkillIdsChange}
        selectedCollectionIds={selectedCollectionIds}
        onCollectionIdsChange={onCollectionIdsChange}
        selectedHtmlTemplateId={selectedHtmlTemplateId}
        onHtmlTemplateIdChange={onHtmlTemplateIdChange}
        selectedMcpToolIds={selectedMcpToolIds}
        onMcpToolIdsChange={onMcpToolIdsChange}
        onOpenPicker={(picker) => openChatAttachPicker(setActivePicker, picker)}
        showJumpToBottom={showJumpToBottom}
        onJumpToBottom={onJumpToBottom}
      />
      <div className={cn('flex min-w-0 items-end', isImmersive ? 'gap-2' : 'gap-1')}>
        <ChatComposerAttachMenu
          disabled={composerBusy}
          compact={!isImmersive}
          modelOverride={modelOverride}
          onModelChange={onModelChange}
          selectedSkillIds={selectedSkillIds}
          onSkillIdsChange={onSkillIdsChange}
          selectedCollectionIds={selectedCollectionIds}
          onCollectionIdsChange={onCollectionIdsChange}
          selectedHtmlTemplateId={selectedHtmlTemplateId}
          onHtmlTemplateIdChange={onHtmlTemplateIdChange}
          selectedMcpToolIds={selectedMcpToolIds}
          onMcpToolIdsChange={onMcpToolIdsChange}
          activePicker={activePicker}
          onActivePickerChange={setActivePicker}
        />
        <Textarea
          id={chatInputId}
          name="chat-message"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            activeArtifact
              ? t('chat.artifactSendPlaceholder')
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
        {showStopStreaming ? (
          <Button
            type="button"
            onClick={onCancelStreaming}
            aria-label={t('common.cancel')}
            variant="destructive"
            size="icon"
            className={cn(
              'flex-shrink-0',
              isImmersive ? 'h-11 w-11 rounded-xl' : 'h-8 w-8'
            )}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
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
            {composerBusy ? <InlineSkeleton /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}

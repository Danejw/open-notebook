'use client'

import { useRouter, useParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useSourceChat } from '@/lib/hooks/useSourceChat'
import { useSource } from '@/lib/hooks/use-sources'
import { ChatPanel } from '@/components/source/ChatPanel'
import { useNavigation } from '@/lib/hooks/use-navigation'
import { SourceDetailContent } from '@/components/source/SourceDetailContent'

export default function SourceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sourceId = params?.id ? decodeURIComponent(params.id as string) : ''
  const navigation = useNavigation()
  const { data: source } = useSource(sourceId)

  const projectId = useMemo(() => {
    const linked = source?.projects ?? []
    if (linked.length === 0) return undefined
    return linked[0]
  }, [source?.projects])

  const chat = useSourceChat(sourceId)

  const handleBack = useCallback(() => {
    const returnPath = navigation.getReturnPath()
    router.push(returnPath)
    navigation.clearReturnTo()
  }, [navigation, router])

  return (
    <div className="flex flex-col h-screen">
      <div className="p-6 pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {navigation.getReturnLabel()}
        </Button>
      </div>

      <div className="flex-1 grid gap-6 lg:grid-cols-[2fr_1fr] overflow-hidden px-6">
        <div className="overflow-y-auto px-4 pb-6">
          <SourceDetailContent
            sourceId={sourceId}
            showChatButton={false}
            onClose={handleBack}
          />
        </div>

        <div className="overflow-y-auto px-4 pb-6">
          <ChatPanel
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            streamStatus={chat.streamStatus}
            activityLog={chat.activityLog}
            contextIndicators={chat.contextIndicators}
            onSendMessage={(message, model) => chat.sendMessage(message, model)}
            modelOverride={chat.currentSession?.model_override}
            onModelChange={(model) => {
              if (chat.currentSessionId) {
                chat.updateSession(chat.currentSessionId, { model_override: model })
              }
            }}
            selectedSkillIds={chat.selectedSkillIds}
            onSkillIdsChange={chat.setSelectedSkillIds}
            selectedHtmlTemplateId={chat.selectedHtmlTemplateId}
            onHtmlTemplateIdChange={chat.setSelectedHtmlTemplateId}
            selectedMcpToolIds={chat.selectedMcpToolIds}
            onMcpToolIdsChange={chat.setSelectedMcpToolIds}
            liveMcpToolCalls={chat.liveMcpToolCalls}
            sessions={chat.sessions}
            currentSessionId={chat.currentSessionId}
            onCreateSession={(title) => chat.createSession({ title })}
            onSelectSession={chat.switchSession}
            onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
            onDeleteSession={chat.deleteSession}
            loadingSessions={chat.loadingSessions}
            projectId={projectId}
            sourceId={sourceId}
          />
        </div>
      </div>
    </div>
  )
}

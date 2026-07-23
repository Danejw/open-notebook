'use client'

import { FileText, MessageSquare, Boxes } from 'lucide-react'
import { SourcesColumn } from '@/app/(dashboard)/projects/components/SourcesColumn'
import { ArtifactsColumn } from '@/app/(dashboard)/projects/components/ArtifactsColumn'
import { ChatColumn } from '@/app/(dashboard)/projects/components/ChatColumn'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UnreadDot } from '@/components/ui/unread-dot'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

type SourcesColumnProps = ComponentProps<typeof SourcesColumn>
type ArtifactsColumnProps = ComponentProps<typeof ArtifactsColumn>
type ChatColumnProps = ComponentProps<typeof ChatColumn>

export interface ProjectMobileLayoutProps {
  mobileActiveTab: 'sources' | 'notes' | 'chat'
  onMobileTabChange: (tab: 'sources' | 'notes' | 'chat') => void
  hasUnseenArtifacts: boolean
  chatUnread: boolean
  sourcesColumnProps: SourcesColumnProps
  artifactsColumnProps: ArtifactsColumnProps
  chatColumnProps: ChatColumnProps
}

export function ProjectMobileLayout({
  mobileActiveTab,
  onMobileTabChange,
  hasUnseenArtifacts,
  chatUnread,
  sourcesColumnProps,
  artifactsColumnProps,
  chatColumnProps,
}: ProjectMobileLayoutProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="shrink-0 lg:hidden">
        <Tabs
          className="gap-0"
          value={mobileActiveTab}
          onValueChange={(value) =>
            onMobileTabChange(value as 'sources' | 'notes' | 'chat')
          }
        >
          <TabsList className="grid h-auto w-full grid-cols-3 gap-0 p-0.5">
            <TabsTrigger value="sources" className="h-7 gap-1 px-2 text-xs">
              <FileText className="h-3.5 w-3.5" />
              {t('navigation.sources')}
            </TabsTrigger>
            <TabsTrigger value="notes" className="relative h-7 gap-1 px-2 text-xs">
              <Boxes className="h-3.5 w-3.5" />
              <span className="inline-flex items-center gap-1">
                {t('common.notes')}
                {hasUnseenArtifacts ? <UnreadDot /> : null}
              </span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="relative h-7 gap-1 px-2 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="inline-flex items-center gap-1">
                {t('common.chat')}
                {chatUnread ? <UnreadDot /> : null}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Keep Chat mounted (hidden) so queue/SSE keep running. */}
      <div className="relative min-h-0 flex-1 overflow-hidden lg:hidden">
        {mobileActiveTab === 'sources' ? (
          <div className="absolute inset-0 min-h-0 overflow-hidden">
            <SourcesColumn {...sourcesColumnProps} />
          </div>
        ) : null}
        {mobileActiveTab === 'notes' ? (
          <div className="absolute inset-0 min-h-0 overflow-hidden">
            <ArtifactsColumn {...artifactsColumnProps} />
          </div>
        ) : null}
        <div
          className={cn(
            'absolute inset-0 min-h-0 overflow-hidden',
            mobileActiveTab !== 'chat' && 'hidden'
          )}
        >
          <ChatColumn {...chatColumnProps} />
        </div>
      </div>
    </>
  )
}

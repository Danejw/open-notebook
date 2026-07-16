'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Clock } from 'lucide-react'
import { BaseChatSession } from '@/lib/types/api'
import { SessionManager } from '@/components/source/SessionManager'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  ColumnHeader,
  columnHeaderGhostButtonClassName,
  columnHeaderIconClassName,
} from '@/components/projects/ColumnHeader'

export interface ChatSessionHeaderProps {
  title: string
  titleAdornment?: ReactNode
  variant?: 'column' | 'immersive'
  sessions?: BaseChatSession[]
  currentSessionId?: string | null
  onCreateSession?: (title: string) => void
  onSelectSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onUpdateSession?: (sessionId: string, title: string) => void
  loadingSessions?: boolean
  headerActions?: ReactNode
}

export function ChatSessionHeader({
  title,
  titleAdornment,
  variant = 'column',
  sessions = [],
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onUpdateSession,
  loadingSessions = false,
  headerActions,
}: ChatSessionHeaderProps) {
  const { t } = useTranslation()
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const isImmersive = variant === 'immersive'
  const hasSessionControls =
    Boolean(onSelectSession && onCreateSession && onDeleteSession)

  return (
    <ColumnHeader
      title={title}
      titleAdornment={titleAdornment}
      className={
        isImmersive
          ? 'gap-3 border-border/60 px-5 py-4 sm:px-6 sm:py-5'
          : undefined
      }
      titleClassName={
        isImmersive
          ? 'text-lg font-semibold leading-snug tracking-tight sm:text-xl'
          : undefined
      }
      actions={
        hasSessionControls || headerActions ? (
          <>
            {hasSessionControls ? (
              <Dialog open={sessionManagerOpen} onOpenChange={setSessionManagerOpen}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={columnHeaderGhostButtonClassName}
                  onClick={() => setSessionManagerOpen(true)}
                  disabled={loadingSessions}
                >
                  <Clock className={columnHeaderIconClassName} />
                  {t('chat.sessions')}
                </Button>
                <DialogContent className="overflow-hidden p-0 [&>button]:z-10">
                  <DialogTitle className="sr-only">{t('chat.sessionsTitle')}</DialogTitle>
                  <SessionManager
                    sessions={sessions}
                    currentSessionId={currentSessionId ?? null}
                    onCreateSession={(sessionTitle) => onCreateSession?.(sessionTitle)}
                    onSelectSession={(sessionId) => {
                      onSelectSession?.(sessionId)
                      setSessionManagerOpen(false)
                    }}
                    onUpdateSession={(sessionId, sessionTitle) =>
                      onUpdateSession?.(sessionId, sessionTitle)
                    }
                    onDeleteSession={(sessionId) => onDeleteSession?.(sessionId)}
                    loadingSessions={loadingSessions}
                  />
                </DialogContent>
              </Dialog>
            ) : null}
            {headerActions}
          </>
        ) : undefined
      }
    />
  )
}

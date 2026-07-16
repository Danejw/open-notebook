'use client'

import { useEffect, useMemo, useState } from 'react'
import { A2uiSurface } from '@a2ui/react/v0_9'
import { injectStyles } from '@a2ui/react/styles'
import { isA2uiChatEnabled } from '@/lib/a2ui/constants'
import { useA2uiSurfaceStore } from '@/lib/a2ui/surface-store'
import { useTranslation } from '@/lib/hooks/use-translation'

interface A2uiMessageSurfaceProps {
  messageId: string
}

let a2uiStylesInjected = false

/**
 * Renders A2UI surfaces associated with a chat message.
 * Falls back to a muted notice when validation/processing failed.
 */
export function A2uiMessageSurface({ messageId }: A2uiMessageSurfaceProps) {
  const { t } = useTranslation()
  const enabled = isA2uiChatEnabled()
  const revision = useA2uiSurfaceStore((state) => state.revision)
  const processor = useA2uiSurfaceStore((state) => state.processor)
  const ensureProcessor = useA2uiSurfaceStore((state) => state.ensureProcessor)
  const surfaceIds = useA2uiSurfaceStore((state) =>
    state.getSurfaceIdsForMessage(messageId)
  )
  const error = useA2uiSurfaceStore((state) => state.getErrorForMessage(messageId))
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) {
      return
    }
    if (!a2uiStylesInjected) {
      injectStyles()
      a2uiStylesInjected = true
    }
    ensureProcessor()
  }, [enabled, ensureProcessor])

  useEffect(() => {
    if (!processor) {
      return
    }
    const sync = () => setTick((value) => value + 1)
    const created = processor.onSurfaceCreated(sync)
    const deleted = processor.onSurfaceDeleted(sync)
    return () => {
      created.unsubscribe()
      deleted.unsubscribe()
    }
  }, [processor])

  const surfaces = useMemo(() => {
    if (!processor) {
      return []
    }
    return surfaceIds
      .map((id) => processor.model.surfacesMap.get(id))
      .filter((surface): surface is NonNullable<typeof surface> => !!surface)
    // revision + tick force refresh when processor mutates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processor, surfaceIds, revision])

  // #region agent log
  useEffect(() => {
    if (!enabled || surfaceIds.length === 0) {
      return
    }
    void fetch('http://127.0.0.1:7837/ingest/abf31c58-d978-4742-b014-939241ddfcd2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'eba9bf',
      },
      body: JSON.stringify({
        sessionId: 'eba9bf',
        hypothesisId: 'F',
        location: 'A2uiMessageSurface.tsx:render-check',
        message: 'surface id vs processor model',
        data: {
          messageId,
          surfaceIds,
          resolvedCount: surfaces.length,
          processorSurfaceCount: processor?.model.surfacesMap.size ?? 0,
          orphaned: surfaceIds.length > 0 && surfaces.length === 0,
          error,
        },
        timestamp: Date.now(),
        runId: 'post-fix',
      }),
    }).catch(() => {})
  }, [enabled, messageId, surfaceIds, surfaces.length, processor, error])
  // #endregion

  if (!enabled) {
    return null
  }

  if (error && surfaces.length === 0) {
    return (
      <div className="w-full rounded-lg border border-dashed p-3">
        <p className="text-sm font-medium">{t('chat.a2uiUnavailable')}</p>
        <p className="text-xs text-muted-foreground">{t('chat.a2uiUnavailableHint')}</p>
      </div>
    )
  }

  if (surfaces.length === 0) {
    return null
  }

  return (
    <div className="w-full space-y-2 rounded-lg border bg-background p-3">
      <p className="px-0.5 text-xs text-muted-foreground">{t('chat.a2uiInteractive')}</p>
      {surfaces.map((surface) => (
        <A2uiSurface key={surface.id} surface={surface} />
      ))}
    </div>
  )
}

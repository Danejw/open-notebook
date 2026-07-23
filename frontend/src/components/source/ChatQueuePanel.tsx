'use client'

import { useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ChevronDown, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { QueueItemRow } from '@/components/source/chat-queue/QueueItemRow'
import {
  compareQueueItemFifo,
  isQueuedForPanel,
  reorderPendingItemIds,
} from '@/components/source/chat-queue/queueUtils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useTranslation } from '@/lib/hooks/use-translation'
import type {
  ChatQueueItemResponse,
  ChatQueueItemUpdatePayload,
  ChatQueueResponse,
} from '@/lib/types/chat-queue'

export interface ChatQueuePanelProps {
  queue: ChatQueueResponse
  onPause: () => void | Promise<unknown>
  onResume: () => void | Promise<unknown>
  onEditItem: (
    itemId: string,
    payload: ChatQueueItemUpdatePayload
  ) => void | Promise<unknown>
  onDeleteItem: (itemId: string) => void | Promise<unknown>
  onRetryItem: (itemId: string) => void | Promise<unknown>
  onReorder: (itemIds: string[]) => void | Promise<unknown>
  /** Queue SSE disconnect / parse failure — show retry affordance. */
  streamError?: Error | null
  onRetryStream?: () => void
  disabled?: boolean
}

export { reorderPendingItemIds } from '@/components/source/chat-queue/queueUtils'

/**
 * Displays and controls one session's persistent chat queue.
 */
export function ChatQueuePanel({
  queue,
  onPause,
  onResume,
  onEditItem,
  onDeleteItem,
  onRetryItem,
  onReorder,
  streamError = null,
  onRetryStream,
  disabled = false,
}: ChatQueuePanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [deleteTarget, setDeleteTarget] =
    useState<ChatQueueItemResponse | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const queuedItems = useMemo(
    () =>
      queue.items
        .filter((item) => item.visible && isQueuedForPanel(item.status))
        .sort(compareQueueItemFifo),
    [queue.items]
  )
  const queuedCount = queuedItems.length
  const pendingIds = queuedItems
    .filter((item) => item.status === 'pending')
    .map((item) => item.id)

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const reordered = reorderPendingItemIds(
      pendingIds,
      String(active.id),
      String(over.id)
    )
    if (reordered !== pendingIds) {
      void onReorder(reordered)
    }
  }

  const requestDelete = (item: ChatQueueItemResponse) => {
    setDeleteTarget(item)
  }

  if (queuedCount === 0 && !streamError) {
    return null
  }

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="shrink-0 border-t border-border/60 bg-muted/10 px-2 py-1">
          <div className="flex items-center gap-1">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 min-w-0 flex-1 justify-start gap-1 px-1 text-xs font-medium"
              >
                {open ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{t('chat.queue')}</span>
                <span className="tabular-nums text-muted-foreground">
                  {queuedCount}
                </span>
              </Button>
            </CollapsibleTrigger>
            {streamError && onRetryStream ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-destructive"
                aria-label={t('common.retry')}
                title={streamError.message || t('common.retry')}
                onClick={() => onRetryStream()}
                disabled={disabled}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            ) : null}
            {queue.status === 'paused' ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                aria-label={t('chat.queueResume')}
                title={t('chat.queueResume')}
                onClick={() => void onResume()}
                disabled={disabled}
              >
                <Play className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                aria-label={t('chat.queuePause')}
                title={t('chat.queuePause')}
                onClick={() => void onPause()}
                disabled={disabled}
              >
                <Pause className="h-3 w-3" />
              </Button>
            )}
          </div>
          {streamError ? (
            <p
              className="px-1 pb-0.5 text-[11px] leading-snug text-destructive"
              role="alert"
            >
              {streamError.message || t('common.retry')}
            </p>
          ) : null}
          <CollapsibleContent>
            <div className="max-h-40 divide-y divide-border/50 overflow-y-auto hide-scrollbar">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={queuedItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {queuedItems.map((item) => (
                    <QueueItemRow
                      key={item.id}
                      item={item}
                      sortable={item.status === 'pending'}
                      disabled={disabled}
                      onEditItem={onEditItem}
                      onDeleteRequest={requestDelete}
                      onRetryItem={onRetryItem}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null)
        }}
        title={t('chat.queueDeleteTitle')}
        description={t('chat.queueDeleteDescription')}
        confirmVariant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            void onDeleteItem(deleteTarget.id)
          }
          setDeleteTarget(null)
        }}
      />
    </>
  )
}

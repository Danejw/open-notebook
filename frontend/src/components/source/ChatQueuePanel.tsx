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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type {
  ChatQueueItemResponse,
  ChatQueueItemStatus,
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
  disabled?: boolean
}

function shortItemId(itemId: string): string {
  return itemId.includes(':') ? itemId.slice(itemId.indexOf(':') + 1) : itemId
}

function queueStatusKey(status: ChatQueueItemStatus): string {
  switch (status) {
    case 'pending':
      return 'chat.queueStatusPending'
    case 'running':
      return 'chat.queueStatusRunning'
    case 'completed':
      return 'chat.queueStatusCompleted'
    case 'failed':
      return 'chat.queueStatusFailed'
    case 'cancelled':
      return 'chat.queueStatusCancelled'
    default: {
      const exhaustiveStatus: never = status
      return exhaustiveStatus
    }
  }
}

/**
 * Returns a pending-item order after one pointer or keyboard drag.
 */
export function reorderPendingItemIds(
  itemIds: string[],
  activeId: string,
  overId: string
): string[] {
  const activeIndex = itemIds.indexOf(activeId)
  const overIndex = itemIds.indexOf(overId)
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return itemIds
  }
  return arrayMove(itemIds, activeIndex, overIndex)
}

/**
 * Queue panel only lists prompts that have not started yet, plus failures
 * so users can retry/delete. Running items leave the list when claimed.
 */
function isQueuedForPanel(status: ChatQueueItemStatus): boolean {
  switch (status) {
    case 'pending':
    case 'failed':
      return true
    case 'running':
    case 'completed':
    case 'cancelled':
      return false
    default: {
      const exhaustiveStatus: never = status
      return exhaustiveStatus
    }
  }
}

/**
 * FIFO display order: lowest position first (top), matching drain order.
 */
export function compareQueueItemFifo(
  left: ChatQueueItemResponse,
  right: ChatQueueItemResponse
): number {
  const positionDifference = left.position - right.position
  if (positionDifference !== 0) {
    return positionDifference
  }
  return left.id.localeCompare(right.id)
}

interface QueueItemRowProps {
  item: ChatQueueItemResponse
  disabled: boolean
  sortable?: boolean
  onEditItem: ChatQueuePanelProps['onEditItem']
  onDeleteRequest: (item: ChatQueueItemResponse) => void
  onRetryItem: ChatQueuePanelProps['onRetryItem']
}

function QueueItemRow({
  item,
  disabled,
  sortable = false,
  onEditItem,
  onDeleteRequest,
  onRetryItem,
}: QueueItemRowProps) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [prompt, setPrompt] = useState(item.prompt)
  const [loopCount, setLoopCount] = useState(item.loop_count)
  const sortableState = useSortable({
    id: item.id,
    disabled: !sortable || disabled,
  })
  const itemLabel = shortItemId(item.id)
  const isMutable = item.status === 'pending' || item.status === 'failed'
  const showStatus = item.status === 'running' || item.status === 'failed'
  const style = {
    transform: CSS.Transform.toString(sortableState.transform),
    transition: sortableState.transition,
  }

  const saveEdit = () => {
    const normalizedPrompt = prompt.trim()
    if (!normalizedPrompt || loopCount < 1 || loopCount > 10) return
    void onEditItem(item.id, {
      prompt: normalizedPrompt,
      loop_count: loopCount,
    })
    setIsEditing(false)
  }

  return (
    <div
      ref={sortableState.setNodeRef}
      style={style}
      data-testid="queue-item"
      className={cn(
        'group/item relative px-1 py-1.5 text-xs',
        item.status === 'failed' && 'bg-destructive/5'
      )}
    >
      {isEditing ? (
        <div className="space-y-1.5">
          <Textarea
            aria-label={t('chat.queuePrompt')}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-12 px-2 py-1.5 text-xs"
            disabled={disabled}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground" aria-hidden>
              ×
            </span>
            <Input
              aria-label={t('chat.queueRuns')}
              type="number"
              min={Math.max(1, item.current_loop)}
              max={10}
              value={loopCount}
              onChange={(event) =>
                setLoopCount(
                  Math.min(
                    10,
                    Math.max(
                      Math.max(1, item.current_loop),
                      Number(event.target.value)
                    )
                  )
                )
              }
              className="h-7 w-12 px-1.5 text-xs"
              disabled={disabled}
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={saveEdit}
              disabled={disabled || !prompt.trim()}
            >
              {t('common.save')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={t('common.cancel')}
              onClick={() => {
                setPrompt(item.prompt)
                setLoopCount(item.loop_count)
                setIsEditing(false)
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-1">
          {sortable ? (
            <button
              type="button"
              aria-label={`${t('chat.queueDrag')} ${itemLabel}`}
              className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/item:opacity-100 group-focus-within/item:opacity-100"
              disabled={disabled}
              {...sortableState.attributes}
              {...sortableState.listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="mt-0.5 w-[18px] shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words leading-snug">{item.prompt}</p>
            {(showStatus || item.loop_count > 1 || item.error_message) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {showStatus ? (
                  <span
                    className={cn(
                      item.status === 'failed' && 'text-destructive',
                      item.status === 'running' && 'text-foreground/80'
                    )}
                  >
                    {t(queueStatusKey(item.status))}
                  </span>
                ) : null}
                {item.loop_count > 1 ? (
                  <span>
                    {t('chat.queueRunProgress')}{' '}
                    {Math.max(1, Math.min(item.current_loop, item.loop_count))}/
                    {item.loop_count}
                  </span>
                ) : null}
                {item.error_message ? (
                  <span className="line-clamp-1 text-destructive">
                    {item.error_message}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          {isMutable ? (
            <div
              className={cn(
                'flex shrink-0 items-center gap-0.5',
                item.status === 'failed'
                  ? 'opacity-100'
                  : 'opacity-0 transition-opacity focus-within:opacity-100 group-hover/item:opacity-100 group-focus-within/item:opacity-100'
              )}
            >
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={`${t('chat.queueEdit')} ${itemLabel}`}
                onClick={() => setIsEditing(true)}
                disabled={disabled}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              {item.status === 'failed' ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`${t('chat.queueRetry')} ${itemLabel}`}
                  onClick={() => void onRetryItem(item.id)}
                  disabled={disabled}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                aria-label={`${t('chat.queueDelete')} ${itemLabel}`}
                onClick={() => onDeleteRequest(item)}
                disabled={disabled}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

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

  if (queuedCount === 0) {
    return null
  }

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="border-t border-border/60 bg-muted/10 px-1.5 py-1">
          <div className="flex items-center gap-0.5">
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
          <CollapsibleContent>
            <div className="mt-0.5 max-h-48 divide-y divide-border/50 overflow-y-auto hide-scrollbar">
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

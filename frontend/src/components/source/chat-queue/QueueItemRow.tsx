'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type {
  ChatQueueItemResponse,
  ChatQueueItemUpdatePayload,
} from '@/lib/types/chat-queue'
import { queueStatusKey, shortItemId } from '@/components/source/chat-queue/queueUtils'

export interface QueueItemRowProps {
  item: ChatQueueItemResponse
  disabled: boolean
  sortable?: boolean
  onEditItem: (
    itemId: string,
    payload: ChatQueueItemUpdatePayload
  ) => void | Promise<unknown>
  onDeleteRequest: (item: ChatQueueItemResponse) => void
  onRetryItem: (itemId: string) => void | Promise<unknown>
}

export function QueueItemRow({
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
        'group/item relative px-2 py-1 text-xs',
        item.status === 'failed' && 'bg-destructive/5'
      )}
    >
      {isEditing ? (
        <div className="space-y-1">
          <Textarea
            aria-label={t('chat.queuePrompt')}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-12 px-2 py-1 text-xs"
            disabled={disabled}
          />
          <div className="flex items-center gap-1">
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
              className="h-6 w-12 px-1.5 text-xs"
              disabled={disabled}
            />
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={saveEdit}
              disabled={disabled || !prompt.trim()}
            >
              {t('common.save')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
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
        <div className="flex items-center gap-1">
          {sortable ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`${t('chat.queueDrag')} ${itemLabel}`}
              className="h-auto w-auto cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-transparent hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100 group-focus-within/item:opacity-100"
              disabled={disabled}
              {...sortableState.attributes}
              {...sortableState.listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span className="w-[18px] shrink-0" aria-hidden />
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
                className="h-6 w-6"
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
                  className="h-6 w-6"
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
                className="h-6 w-6 text-destructive"
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

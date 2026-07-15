'use client'

import { useEffect, useState } from 'react'
import { Database, Network, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { SourceProcessingFailure } from '@/lib/types/api'

export type StageActionState = 'idle' | 'running' | 'done' | 'failed'

interface SourceStageActionsProps {
  embedState: StageActionState
  kgState: StageActionState
  extractReady: boolean
  embedBusy: boolean
  kgBusy: boolean
  embedFailure?: SourceProcessingFailure
  kgFailure?: SourceProcessingFailure
  failureDetailsUnavailable?: boolean
  onRunEmbeddings: () => void
  onRunKnowledgeGraph: () => void
}

/** Radix DropdownMenu + AlertDialog can leave body pointer-events:none after close. */
function clearBodyPointerLock() {
  if (typeof document === 'undefined') return
  document.body.style.pointerEvents = ''
  document.body.removeAttribute('data-scroll-locked')
}

/**
 * Compact embeddings + knowledge-graph controls for the source list row.
 * Incomplete/failed → confirm then run. Completed → re-run menu → confirm.
 */
export function SourceStageActions({
  embedState,
  kgState,
  extractReady,
  embedBusy,
  kgBusy,
  embedFailure,
  kgFailure,
  failureDetailsUnavailable = false,
  onRunEmbeddings,
  onRunKnowledgeGraph,
}: SourceStageActionsProps) {
  const { t } = useTranslation()
  const [confirmKind, setConfirmKind] = useState<
    'embed' | 'embed-rerun' | 'kg' | 'kg-rerun' | null
  >(null)

  const confirmOpen = confirmKind !== null
  const confirmBusy =
    confirmKind === 'embed' || confirmKind === 'embed-rerun'
      ? embedBusy
      : kgBusy

  useEffect(() => {
    if (!confirmOpen) {
      clearBodyPointerLock()
    }
  }, [confirmOpen])

  const openConfirm = (kind: 'embed' | 'embed-rerun' | 'kg' | 'kg-rerun') => {
    // Let any open dropdown finish unmounting before the dialog locks focus.
    window.setTimeout(() => {
      clearBodyPointerLock()
      setConfirmKind(kind)
    }, 0)
  }

  const handleConfirm = () => {
    const kind = confirmKind
    setConfirmKind(null)
    clearBodyPointerLock()
    // Defer the mutation so dialog teardown (and pointer unlock) finish first.
    window.setTimeout(() => {
      clearBodyPointerLock()
      if (kind === 'embed' || kind === 'embed-rerun') {
        onRunEmbeddings()
      } else if (kind === 'kg' || kind === 'kg-rerun') {
        onRunKnowledgeGraph()
      }
    }, 0)
  }

  const confirmCopy =
    confirmKind === 'embed'
      ? {
          title: t('sources.embeddingsConfirmTitle'),
          description: t('sources.embeddingsConfirmDesc'),
        }
      : confirmKind === 'embed-rerun'
        ? {
            title: t('sources.embeddingsRerunTitle'),
            description: t('sources.embeddingsRerunDesc'),
          }
        : confirmKind === 'kg'
          ? {
              title: t('sources.knowledgeGraphConfirmTitle'),
              description: t('sources.knowledgeGraphConfirmDesc'),
            }
          : {
              title: t('sources.knowledgeGraphRerunTitle'),
              description: t('sources.knowledgeGraphRerunDesc'),
            }

  return (
    <>
      <StageIconButton
        kind="embed"
        state={embedState}
        disabled={!extractReady || embedState === 'running' || embedBusy}
        doneLabel={t('sources.embeddingsDone')}
        runningLabel={t('sources.embeddingsRunning')}
        failedLabel={t('sources.embeddingsFailed')}
        idleLabel={t('sources.embeddingsMissing')}
        rerunLabel={t('sources.embeddingsRerun')}
        retryLabel={t('sources.retry')}
        failure={embedFailure}
        failureDetailsUnavailable={failureDetailsUnavailable}
        unavailableLabel={t('sources.failureDetailsUnavailable')}
        errorDetailsLabel={t('common.errorDetails')}
        onStart={() => openConfirm('embed')}
        onRerun={() => openConfirm('embed-rerun')}
      />
      <StageIconButton
        kind="kg"
        state={kgState}
        disabled={
          !extractReady ||
          kgState === 'running' ||
          kgBusy ||
          (kgState !== 'done' && embedState !== 'done')
        }
        doneLabel={t('sources.knowledgeGraphDone')}
        runningLabel={t('sources.knowledgeGraphRunning')}
        failedLabel={t('sources.knowledgeGraphFailed')}
        idleLabel={
          embedState !== 'done'
            ? t('sources.knowledgeGraphNeedsEmbeddings')
            : t('sources.knowledgeGraphMissing')
        }
        rerunLabel={t('sources.knowledgeGraphRerun')}
        retryLabel={t('sources.retry')}
        failure={kgFailure}
        failureDetailsUnavailable={failureDetailsUnavailable}
        unavailableLabel={t('sources.failureDetailsUnavailable')}
        errorDetailsLabel={t('common.errorDetails')}
        onStart={() => openConfirm('kg')}
        onRerun={() => openConfirm('kg-rerun')}
      />
      <span
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmKind(null)
              clearBodyPointerLock()
            }
          }}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmText={t('common.confirm')}
          onConfirm={handleConfirm}
          isLoading={confirmBusy}
        />
      </span>
    </>
  )
}

function StageIconButton({
  state,
  disabled,
  doneLabel,
  runningLabel,
  failedLabel,
  idleLabel,
  rerunLabel,
  retryLabel,
  failure,
  failureDetailsUnavailable,
  unavailableLabel,
  errorDetailsLabel,
  onStart,
  onRerun,
  kind,
}: {
  kind: 'embed' | 'kg'
  state: StageActionState
  disabled: boolean
  doneLabel: string
  runningLabel: string
  failedLabel: string
  idleLabel: string
  rerunLabel: string
  retryLabel: string
  failure?: SourceProcessingFailure
  failureDetailsUnavailable: boolean
  unavailableLabel: string
  errorDetailsLabel: string
  onStart: () => void
  onRerun: () => void
}) {
  const Icon = kind === 'embed' ? Database : Network
  const colorClass =
    state === 'done'
      ? 'text-emerald-600'
      : state === 'running'
        ? 'text-blue-600'
        : state === 'failed'
          ? 'text-destructive'
          : 'text-muted-foreground'

  const title =
    state === 'done'
      ? doneLabel
      : state === 'running'
        ? runningLabel
        : state === 'failed'
          ? failedLabel
          : idleLabel

  const icon = (
    <Icon
      className={cn('h-3.5 w-3.5', state === 'running' && 'animate-pulse')}
    />
  )

  if (state === 'failed') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-6 w-6 p-0', colorClass)}
            title={title}
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {icon}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 space-y-2 p-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-medium text-destructive">
            {errorDetailsLabel}: {failedLabel}
          </p>
          <p className="break-words text-xs">
            {failure?.message ??
              (failureDetailsUnavailable ? unavailableLabel : failedLabel)}
          </p>
          {failure && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {failure.error_type && <span>{failure.error_type}</span>}
              {failure.occurred_at && (
                <time dateTime={failure.occurred_at}>
                  {new Date(failure.occurred_at).toLocaleString()}
                </time>
              )}
              {failure.command_id && (
                <code className="break-all">{failure.command_id}</code>
              )}
            </div>
          )}
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation()
              onStart()
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        </PopoverContent>
      </Popover>
    )
  }

  if (state === 'done') {
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-6 w-6 p-0', colorClass)}
            title={title}
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => {
            // Keep focus from bouncing back onto the row and eating the next click.
            e.preventDefault()
            clearBodyPointerLock()
          }}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              onRerun()
            }}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            {rerunLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('h-6 w-6 p-0', colorClass)}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onStart()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {icon}
    </Button>
  )
}

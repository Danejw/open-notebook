'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  FileText,
  MoreVertical,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Unlink,
  EyeOff,
  Network,
  DraftingCompass,
  Eye,
} from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { listActionTriggerClassName } from '@/lib/utils/list-action-trigger'
import { cn } from '@/lib/utils'
import type { ContextMode } from '@/app/(dashboard)/projects/[id]/page'
import type { StageActionState } from '@/components/sources/SourceStageActions'

export interface SourceCardActionMenuProps {
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  sourceType: 'link' | 'upload' | 'text'
  isCompleted: boolean
  isFailed: boolean
  contextMode?: ContextMode
  onContextModeChange?: (mode: ContextMode) => void
  showRemoveFromProject: boolean
  onRemoveFromProject?: () => void
  onRetry?: () => void
  onRefreshContent?: () => void
  kgStatusLoading: boolean
  kgBuilding: boolean
  kgFailed: boolean
  showBuildKnowledgeGraph: boolean
  hasKnowledgeGraph: boolean
  extractKnowledgeBuilding: boolean
  onBuildKnowledgeGraph: () => void
  showDrawingActions: boolean
  drawingEligible: boolean
  drawingState: StageActionState
  drawingBusy: boolean
  drawingRunId?: string | null
  onRunDrawingExtraction?: () => void
  onInspectDrawing?: () => void
  onDelete?: () => void
}

export function SourceCardActionMenu({
  menuOpen,
  onMenuOpenChange,
  sourceType,
  isCompleted,
  isFailed,
  contextMode,
  onContextModeChange,
  showRemoveFromProject,
  onRemoveFromProject,
  onRetry,
  onRefreshContent,
  kgStatusLoading,
  kgBuilding,
  kgFailed,
  showBuildKnowledgeGraph,
  hasKnowledgeGraph,
  extractKnowledgeBuilding,
  onBuildKnowledgeGraph,
  showDrawingActions,
  drawingEligible,
  drawingState,
  drawingBusy,
  drawingRunId,
  onRunDrawingExtraction,
  onInspectDrawing,
  onDelete,
}: SourceCardActionMenuProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 w-7 p-0', listActionTriggerClassName)}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('common.actions')}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onContextModeChange && contextMode ? (
          <>
            <DropdownMenuLabel>{t('sources.bulkContext')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={contextMode}
              onValueChange={(value) => onContextModeChange(value as ContextMode)}
            >
              <DropdownMenuRadioItem
                value="off"
                onClick={(e) => e.stopPropagation()}
              >
                <EyeOff className="h-4 w-4" />
                {t('common.contextModes.off')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="full"
                onClick={(e) => e.stopPropagation()}
              >
                <FileText className="h-4 w-4" />
                {t('common.contextModes.full')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {showRemoveFromProject ? (
          <>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onRemoveFromProject?.()
              }}
              disabled={!onRemoveFromProject}
            >
              <Unlink className="h-4 w-4 mr-2" />
              {t('sources.removeFromProject')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {isFailed ? (
          <>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onRetry?.()
              }}
              disabled={!onRetry}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('sources.retryProcessing')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {sourceType === 'link' && isCompleted && onRefreshContent ? (
          <>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onRefreshContent()
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('sources.refreshContent')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {isCompleted ? (
          <>
            {kgStatusLoading ? (
              <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                <Network className="h-4 w-4 mr-2" />
                {t('sources.checkingKnowledgeGraph')}
              </DropdownMenuItem>
            ) : kgBuilding ? (
              <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                <Network className="h-4 w-4 mr-2 animate-pulse" />
                {t('sources.buildingKnowledgeGraph')}
              </DropdownMenuItem>
            ) : kgFailed ? (
              <>
                <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
                  <span className="text-destructive">
                    {t('sources.knowledgeGraphFailed')}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onBuildKnowledgeGraph()
                  }}
                  disabled={extractKnowledgeBuilding}
                >
                  <Network className="h-4 w-4 mr-2" />
                  {t('sources.retryKnowledgeGraph')}
                </DropdownMenuItem>
              </>
            ) : showBuildKnowledgeGraph ? (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onBuildKnowledgeGraph()
                }}
                disabled={extractKnowledgeBuilding}
              >
                <Network className="h-4 w-4 mr-2" />
                {t('sources.buildKnowledgeGraph')}
              </DropdownMenuItem>
            ) : hasKnowledgeGraph ? (
              <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                {t('sources.knowledgeGraphReady')}
              </DropdownMenuItem>
            ) : null}
            {(kgStatusLoading ||
              showBuildKnowledgeGraph ||
              kgBuilding ||
              kgFailed ||
              hasKnowledgeGraph) && <DropdownMenuSeparator />}
          </>
        ) : null}

        {showDrawingActions ? (
          <>
            {!drawingEligible ? (
              <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                <DraftingCompass className="h-4 w-4 mr-2" />
                {t('sources.drawingPdfOnly')}
              </DropdownMenuItem>
            ) : drawingState === 'running' || drawingBusy ? (
              <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                <DraftingCompass className="h-4 w-4 mr-2 animate-pulse" />
                {t('sources.drawingRunning')}
              </DropdownMenuItem>
            ) : drawingState === 'failed' ? (
              <>
                <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
                  <span className="text-destructive">
                    {t('sources.drawingFailed')}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onMenuOpenChange(false)
                    onRunDrawingExtraction?.()
                  }}
                  disabled={drawingBusy}
                >
                  <DraftingCompass className="h-4 w-4 mr-2" />
                  {t('sources.drawingRerun')}
                </DropdownMenuItem>
              </>
            ) : drawingState === 'done' ? (
              <>
                <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                  <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  {t('sources.drawingDone')}
                </DropdownMenuItem>
                {drawingRunId && onInspectDrawing ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onMenuOpenChange(false)
                      onInspectDrawing()
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {t('sources.drawingInspectResults')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onMenuOpenChange(false)
                    onRunDrawingExtraction?.()
                  }}
                  disabled={drawingBusy}
                >
                  <DraftingCompass className="h-4 w-4 mr-2" />
                  {t('sources.drawingRerun')}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onMenuOpenChange(false)
                  onRunDrawingExtraction?.()
                }}
                disabled={drawingBusy}
              >
                <DraftingCompass className="h-4 w-4 mr-2" />
                {t('sources.extractArchitecturalDrawings')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.()
          }}
          disabled={!onDelete}
          variant="destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t('sources.deleteSource')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

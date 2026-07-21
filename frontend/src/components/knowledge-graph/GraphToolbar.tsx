'use client'

import type { ReactNode } from 'react'
import {
  CircleDot,
  Focus,
  Link2,
  Maximize2,
  PanelLeft,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tag,
} from 'lucide-react'
import { GraphScaleTool } from '@/components/knowledge-graph/GraphScaleTool'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { GraphNodeKind } from '@/lib/api/knowledge-graph'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  EDGE_OPACITY_DEFAULT,
  EDGE_OPACITY_MAX,
  EDGE_OPACITY_MIN,
  NODE_SIZE_SCALE_DEFAULT,
  NODE_SIZE_SCALE_MAX,
  NODE_SIZE_SCALE_MIN,
  useKnowledgeGraphStore,
} from '@/lib/stores/knowledge-graph-store'
import { cn } from '@/lib/utils'

const KIND_OPTIONS: GraphNodeKind[] = [
  'source',
  'community',
  'entity',
  'chunk',
  'claim',
]

interface GraphToolbarProps {
  onSearch: (q: string) => void
  onResetView: () => void
  onFit: () => void
  /** Show sources drawer toggle (full-page only). */
  showSourcesToggle?: boolean
  sourcesOpen?: boolean
  onToggleSources?: () => void
  /** Live KG build in progress for this project. */
  updating?: boolean
  /**
   * `overlay` — floating HUD over the canvas (full-page).
   * `bar` — corner/edge islands for embedded Sources graph.
   */
  layout?: 'overlay' | 'bar'
  /** Top-left island (embedded: List/Graph tabs). */
  leading?: ReactNode
  /** Top-right island (embedded: Add Source). Not inlined with tools. */
  trailing?: ReactNode
}

function ToolIconButton({
  label,
  onClick,
  active,
  compact,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  compact?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={active ? 'default' : 'ghost'}
          className={cn('shrink-0', compact ? 'size-6' : 'size-7')}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function GraphToolbar({
  onSearch,
  onResetView,
  onFit,
  showSourcesToggle = false,
  sourcesOpen = false,
  onToggleSources,
  updating = false,
  layout = 'overlay',
  leading,
  trailing,
}: GraphToolbarProps) {
  const { t } = useTranslation()
  const {
    searchQuery,
    setSearchQuery,
    provenanceMode,
    setProvenanceMode,
    showLabels,
    setShowLabels,
    nodeSizeScale,
    setNodeSizeScale,
    edgeOpacity,
    setEdgeOpacity,
    enabledKinds,
    toggleKind,
    minConfidence,
    setMinConfidence,
    viewMode,
    setViewMode,
    setQueryRunId,
  } = useKnowledgeGraphStore()

  const filterActive =
    provenanceMode ||
    minConfidence > 0 ||
    enabledKinds.length !== KIND_OPTIONS.length
  const nodeSizeActive = nodeSizeScale !== NODE_SIZE_SCALE_DEFAULT
  const edgeOpacityActive = edgeOpacity !== EDGE_OPACITY_DEFAULT

  const isBar = layout === 'bar'

  const searchControl = (
    <div className={cn('relative min-w-0', isBar ? 'w-full' : 'flex-1 basis-28')}>
      <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className={cn(
          'pl-6',
          isBar ? 'h-6 bg-background/80' : 'h-7 bg-background/60'
        )}
        value={searchQuery}
        placeholder={t('knowledge.graphSearch')}
        aria-label={t('knowledge.graphSearch')}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearch(searchQuery)
        }}
      />
    </div>
  )

  const toolControls = (
    <>
      {showSourcesToggle ? (
        <ToolIconButton
          label={t('knowledge.graphSources')}
          onClick={() => onToggleSources?.()}
          active={sourcesOpen}
          compact={isBar}
        >
          <PanelLeft className="size-3.5" />
        </ToolIconButton>
      ) : null}

      <ToolIconButton
        label={t('knowledge.graphFit')}
        onClick={onFit}
        compact={isBar}
      >
        <Maximize2 className="size-3.5" />
      </ToolIconButton>
      <ToolIconButton
        label={t('knowledge.graphReset')}
        onClick={onResetView}
        compact={isBar}
      >
        <RefreshCw className="size-3.5" />
      </ToolIconButton>
      <ToolIconButton
        label={t('knowledge.graphLabels')}
        onClick={() => setShowLabels(!showLabels)}
        active={showLabels}
        compact={isBar}
      >
        <Tag className="size-3.5" />
      </ToolIconButton>

      <GraphScaleTool
        label={t('knowledge.graphNodeSize')}
        lowLabel={t('knowledge.graphNodeSizeSmall')}
        highLabel={t('knowledge.graphNodeSizeLarge')}
        value={nodeSizeScale}
        min={NODE_SIZE_SCALE_MIN}
        max={NODE_SIZE_SCALE_MAX}
        onChange={setNodeSizeScale}
        active={nodeSizeActive}
        compact={isBar}
        icon={<CircleDot className="size-3.5" />}
      />
      <GraphScaleTool
        label={t('knowledge.graphEdgeOpacity')}
        lowLabel={t('knowledge.graphEdgeOpacityFaint')}
        highLabel={t('knowledge.graphEdgeOpacitySolid')}
        value={edgeOpacity}
        min={EDGE_OPACITY_MIN}
        max={EDGE_OPACITY_MAX}
        onChange={setEdgeOpacity}
        active={edgeOpacityActive}
        compact={isBar}
        icon={<Link2 className="size-3.5" />}
      />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={filterActive ? 'secondary' : 'ghost'}
                className={cn('shrink-0', isBar ? 'size-6' : 'size-7')}
                aria-label={t('knowledge.graphFilters')}
              >
                <SlidersHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('knowledge.graphFilters')}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t('knowledge.graphFilters')}</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={provenanceMode}
            onCheckedChange={(checked) => setProvenanceMode(!!checked)}
          >
            {t('knowledge.graphProvenance')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('knowledge.graphConfidence')}</DropdownMenuLabel>
          <div className="px-1.5 pb-1">
            <Input
              type="number"
              min={0}
              max={1}
              step={0.1}
              className="h-7"
              value={minConfidence}
              aria-label={t('knowledge.graphConfidence')}
              onChange={(e) => setMinConfidence(Number(e.target.value) || 0)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('knowledge.entities')}</DropdownMenuLabel>
          {KIND_OPTIONS.map((kind) => (
            <DropdownMenuCheckboxItem
              key={kind}
              checked={enabledKinds.includes(kind)}
              onCheckedChange={() => toggleKind(kind)}
              className="capitalize"
            >
              {kind}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {viewMode === 'queryTrace' && (
        <ToolIconButton
          label={t('knowledge.graphExitTrace')}
          onClick={() => {
            setQueryRunId(null)
            setViewMode('explore')
          }}
          compact={isBar}
        >
          <Focus className="size-3.5" />
        </ToolIconButton>
      )}

      {updating ? (
        <span className="shrink-0 truncate text-[11px] text-primary">
          {t('knowledge.graphUpdating')}
        </span>
      ) : null}
    </>
  )

  if (isBar) {
    return (
      <>
        {leading ? (
          <div
            data-graph-toolbar="leading"
            className="pointer-events-none absolute left-0 top-0 z-20 p-0.5"
          >
            <div className="pointer-events-auto">{leading}</div>
          </div>
        ) : null}

        <div
          data-graph-toolbar="tools"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-0.5"
        >
          <div className="pointer-events-auto flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-md border bg-background/80 p-0.5 shadow-sm backdrop-blur-sm">
            {toolControls}
          </div>
        </div>

        {trailing ? (
          <div
            data-graph-toolbar="trailing"
            className="pointer-events-none absolute right-0 top-0 z-20 p-0.5"
          >
            <div className="pointer-events-auto">{trailing}</div>
          </div>
        ) : null}

        <div
          data-graph-toolbar="search"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-0.5"
        >
          <div className="pointer-events-auto w-full max-w-xs px-6">
            {searchControl}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-0.5 p-0.5">
      <div className="pointer-events-auto flex max-w-full flex-nowrap items-center gap-0.5 rounded-md border bg-background/80 p-0.5 shadow-sm backdrop-blur-sm">
        {searchControl}
        {toolControls}
        {trailing ? (
          <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>
        ) : null}
      </div>
    </div>
  )
}

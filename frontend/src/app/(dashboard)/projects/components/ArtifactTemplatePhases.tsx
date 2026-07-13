'use client'

import { useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Artifact } from '@/lib/types/artifacts'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'
import { setArtifactDragData, clearArtifactDragData } from '@/lib/utils/artifact-drag'
import {
  getArtifactPhaseIcon,
  getArtifactPhaseLabel,
  getVisibleArtifactPhases,
  groupArtifactsByPhase,
  type ArtifactLifecyclePhase,
} from '@/lib/artifact-lifecycle'

interface ArtifactTemplatePhasesProps {
  templates: Artifact[]
  onTemplateClick?: (artifact: Artifact) => void
}

export function ArtifactTemplatePhases({
  templates,
  onTemplateClick,
}: ArtifactTemplatePhasesProps) {
  const suppressClickRef = useRef(false)
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null)
  const grouped = groupArtifactsByPhase(templates)
  const visiblePhases = getVisibleArtifactPhases(grouped)

  if (visiblePhases.length === 0) {
    return null
  }

  return (
    <div className="mb-1 space-y-0.5">
      {visiblePhases.map((phase) => (
        <PhaseSection
          key={phase}
          phase={phase}
          templates={grouped[phase]}
          draggingTemplateId={draggingTemplateId}
          suppressClickRef={suppressClickRef}
          onTemplateClick={onTemplateClick}
          onDragStart={(templateId) => setDraggingTemplateId(templateId)}
          onDragEnd={() => setDraggingTemplateId(null)}
        />
      ))}
    </div>
  )
}

interface PhaseSectionProps {
  phase: ArtifactLifecyclePhase
  templates: Artifact[]
  draggingTemplateId: string | null
  suppressClickRef: React.MutableRefObject<boolean>
  onTemplateClick?: (artifact: Artifact) => void
  onDragStart: (templateId: string) => void
  onDragEnd: () => void
}

function PhaseSection({
  phase,
  templates,
  draggingTemplateId,
  suppressClickRef,
  onTemplateClick,
  onDragStart,
  onDragEnd,
}: PhaseSectionProps) {
  const { t } = useTranslation()
  const PhaseIcon = getArtifactPhaseIcon(phase)

  return (
    <Collapsible defaultOpen={false} className="group rounded-md border border-border/50">
      <CollapsibleTrigger className="flex w-full items-center gap-1 px-1.5 py-0.5 text-left transition-colors hover:bg-accent/40">
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <PhaseIcon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {getArtifactPhaseLabel(phase, t)}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {templates.length}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border/50">
        <div className="@container/phase-grid p-px">
          <div className="grid grid-cols-1 gap-px bg-border/40 @min-[280px]/phase-grid:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                draggable
                aria-grabbed={draggingTemplateId === template.id}
                className={cn(
                  'flex min-w-0 items-center gap-1.5 bg-card px-2 py-1 text-left transition-colors hover:bg-primary/5',
                  'cursor-grab active:cursor-grabbing'
                )}
              onClick={() => {
                if (suppressClickRef.current) return
                onTemplateClick?.(template)
              }}
              onDragStart={(event) => {
                suppressClickRef.current = false
                onDragStart(template.id)
                setArtifactDragData(event.dataTransfer, {
                  kind: 'template',
                  id: template.id,
                  title: template.title,
                })
              }}
              onDrag={(event) => {
                if (event.clientX !== 0 || event.clientY !== 0) {
                  suppressClickRef.current = true
                }
              }}
              onDragEnd={() => {
                onDragEnd()
                clearArtifactDragData()
                window.setTimeout(() => {
                  suppressClickRef.current = false
                }, 0)
              }}
            >
              <PhaseIcon className="h-3 w-3 shrink-0 text-primary/80" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs font-medium leading-snug">
                {template.title}
              </span>
              </button>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

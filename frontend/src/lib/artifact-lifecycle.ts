import type { LucideIcon } from 'lucide-react'
import {
  ClipboardCheck,
  GitMerge,
  HardHat,
  PenLine,
  Sparkles,
  Target,
  Truck,
} from 'lucide-react'
import type { Artifact } from '@/lib/types/artifacts'
import type { TFunction } from 'i18next'
import { ARTIFACT_NAME_TO_PHASE } from '@/lib/artifact-name-phases'

export type ArtifactLifecyclePhase =
  | 'pursuit_bid'
  | 'precon'
  | 'mobilization'
  | 'construction'
  | 'closeout'
  | 'cross_cutting'
  | 'other'

export const ARTIFACT_LIFECYCLE_PHASES: ArtifactLifecyclePhase[] = [
  'pursuit_bid',
  'precon',
  'mobilization',
  'construction',
  'closeout',
  'cross_cutting',
  'other',
]

const PHASE_ICONS: Record<ArtifactLifecyclePhase, LucideIcon> = {
  pursuit_bid: Target,
  precon: PenLine,
  mobilization: Truck,
  construction: HardHat,
  closeout: ClipboardCheck,
  cross_cutting: GitMerge,
  other: Sparkles,
}

function isArtifactLifecyclePhase(value: string): value is ArtifactLifecyclePhase {
  return ARTIFACT_LIFECYCLE_PHASES.includes(value as ArtifactLifecyclePhase)
}

export function getArtifactPhase(template: Artifact): ArtifactLifecyclePhase {
  if (template.lifecycle_phase && isArtifactLifecyclePhase(template.lifecycle_phase)) {
    return template.lifecycle_phase
  }

  const byName = ARTIFACT_NAME_TO_PHASE[template.name] ?? ARTIFACT_NAME_TO_PHASE[template.title]
  if (byName) {
    return byName
  }

  return 'other'
}

export function getArtifactPhaseIcon(phase: ArtifactLifecyclePhase): LucideIcon {
  return PHASE_ICONS[phase]
}

export function getArtifactPhaseLabel(phase: ArtifactLifecyclePhase, t: TFunction): string {
  return t(`projects.artifactPhases.${phase}`)
}

export function groupArtifactsByPhase(
  templates: Artifact[]
): Record<ArtifactLifecyclePhase, Artifact[]> {
  const grouped = Object.fromEntries(
    ARTIFACT_LIFECYCLE_PHASES.map((phase) => [phase, [] as Artifact[]])
  ) as Record<ArtifactLifecyclePhase, Artifact[]>

  for (const template of templates) {
    grouped[getArtifactPhase(template)].push(template)
  }

  for (const phase of ARTIFACT_LIFECYCLE_PHASES) {
    grouped[phase].sort((a, b) => a.title.localeCompare(b.title))
  }

  return grouped
}

export function getVisibleArtifactPhases(
  grouped: Record<ArtifactLifecyclePhase, Artifact[]>
): ArtifactLifecyclePhase[] {
  return ARTIFACT_LIFECYCLE_PHASES.filter(
    (phase) => phase !== 'other' && grouped[phase].length > 0
  ).concat(grouped.other.length > 0 ? (['other'] as const) : [])
}

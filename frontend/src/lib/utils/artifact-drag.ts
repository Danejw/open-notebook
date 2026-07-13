export const ARTIFACT_DRAG_MIME = 'application/x-construction-os-artifact'
export const ARTIFACT_DRAG_PLAIN_PREFIX = 'construction-os-artifact:'

export type ArtifactDragKind = 'template' | 'note'

export interface ArtifactDragPayload {
  kind: ArtifactDragKind
  id: string
  title: string
}

interface DragEventLike {
  dataTransfer: DataTransfer | null
}

let activeDragPayload: ArtifactDragPayload | null = null

function isArtifactDragPayload(value: unknown): value is ArtifactDragPayload {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    (record.kind === 'template' || record.kind === 'note') &&
    typeof record.id === 'string' &&
    typeof record.title === 'string'
  )
}

function parseArtifactDragPayload(raw: string): ArtifactDragPayload | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    return isArtifactDragPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getActiveArtifactDragPayload(): ArtifactDragPayload | null {
  return activeDragPayload
}

export function setArtifactDragData(
  dataTransfer: DataTransfer,
  payload: ArtifactDragPayload
): void {
  activeDragPayload = payload
  const json = JSON.stringify(payload)
  dataTransfer.setData(ARTIFACT_DRAG_MIME, json)
  dataTransfer.setData('text/plain', `${ARTIFACT_DRAG_PLAIN_PREFIX}${json}`)
  dataTransfer.effectAllowed = 'copy'
}

export function clearArtifactDragData(): void {
  activeDragPayload = null
}

export function getArtifactDragData(dataTransfer: DataTransfer): ArtifactDragPayload | null {
  const fromMime = parseArtifactDragPayload(dataTransfer.getData(ARTIFACT_DRAG_MIME))
  if (fromMime) return fromMime

  const plain = dataTransfer.getData('text/plain')
  if (plain.startsWith(ARTIFACT_DRAG_PLAIN_PREFIX)) {
    const fromPlain = parseArtifactDragPayload(
      plain.slice(ARTIFACT_DRAG_PLAIN_PREFIX.length)
    )
    if (fromPlain) return fromPlain
  }

  return activeDragPayload
}

export function isArtifactDragEvent(event: DragEventLike): boolean {
  if (activeDragPayload !== null) return true

  const types = event.dataTransfer?.types
  if (!types) return false
  return Array.from(types).includes(ARTIFACT_DRAG_MIME)
}

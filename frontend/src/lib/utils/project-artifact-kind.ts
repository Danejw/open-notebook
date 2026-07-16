/** Effective kind from API fields during note → project-artifact transition. */
export function getEffectiveArtifactKind(artifact: {
  artifact_kind?: string | null
  note_type?: string | null
}): string | null {
  return artifact.artifact_kind ?? artifact.note_type ?? null
}

export function isGeneratedArtifact(artifact: {
  artifact_kind?: string | null
  note_type?: string | null
}): boolean {
  const kind = getEffectiveArtifactKind(artifact)
  return kind === 'generated' || artifact.note_type === 'artifact'
}

export function isAiArtifact(artifact: {
  artifact_kind?: string | null
  note_type?: string | null
}): boolean {
  return getEffectiveArtifactKind(artifact) === 'ai'
}

export function isManualArtifact(artifact: {
  artifact_kind?: string | null
  note_type?: string | null
}): boolean {
  const kind = getEffectiveArtifactKind(artifact)
  return kind === 'manual' || kind === 'note' || kind === 'human'
}

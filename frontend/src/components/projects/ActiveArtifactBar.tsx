/**
 * Default chat draft when a project artifact template is selected.
 */
export function buildArtifactTriggerMessage(artifactTitle: string): string {
  return `Generate the ${artifactTitle} using the selected project context. Cite all sources.`
}

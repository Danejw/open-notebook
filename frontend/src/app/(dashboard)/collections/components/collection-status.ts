/** Hide perpetual "active" status; show only non-default states. */
export function shouldShowCollectionStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized !== '' && normalized !== 'active'
}

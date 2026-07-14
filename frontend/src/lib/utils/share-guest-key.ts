const STORAGE_PREFIX = 'share-chat-guest-key:'

/** Return a stable per-browser guest key for a shared project chat. */
export function getOrCreateShareGuestKey(projectId: string): string {
  if (typeof window === 'undefined') {
    return ''
  }
  const storageKey = `${STORAGE_PREFIX}${projectId}`
  const existing = localStorage.getItem(storageKey)
  if (existing && existing.trim()) {
    return existing.trim()
  }
  const created =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(storageKey, created)
  return created
}

import { toast } from 'sonner'

export type BulkTranslateFn = (key: string) => string

/**
 * Show success/error toasts for bulk action results.
 */
export function reportBulkResults(
  t: BulkTranslateFn,
  succeeded: number,
  failed: number
): void {
  if (failed > 0) {
    toast.error(t('common.bulkPartial').replace('{failed}', failed.toString()))
  }
  if (succeeded > 0) {
    toast.success(t('common.bulkSuccess').replace('{count}', succeeded.toString()))
  }
}

/**
 * Run per-id async actions and return settled counts (no backend bulk API).
 */
export async function settleBulkActions(
  ids: string[],
  action: (id: string) => Promise<unknown>
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(ids.map((id) => action(id)))
  let succeeded = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'fulfilled') succeeded += 1
    else failed += 1
  }
  return { succeeded, failed }
}

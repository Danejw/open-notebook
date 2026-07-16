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

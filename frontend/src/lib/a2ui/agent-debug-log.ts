/** Dual debug ingest: Cursor proxy + local Next API file writer. */
export function agentDebugLog(payload: {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
  runId?: string
}): void {
  const body = JSON.stringify({
    sessionId: 'eba9bf',
    runId: payload.runId ?? 'pre-fix',
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
    timestamp: Date.now(),
  })
  const headers = {
    'Content-Type': 'application/json',
    'X-Debug-Session-Id': 'eba9bf',
  }
  fetch('http://127.0.0.1:7837/ingest/abf31c58-d978-4742-b014-939241ddfcd2', {
    method: 'POST',
    headers,
    body,
  }).catch(() => {})
  fetch('/api/debug-log', { method: 'POST', headers, body }).catch(() => {})
}

import { NextRequest, NextResponse } from 'next/server'
import { appendFile } from 'fs/promises'
import path from 'path'

/**
 * Debug-mode ingest shim: writes NDJSON to workspace debug-eba9bf.log.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const line = JSON.stringify({
      ...body,
      sessionId: body.sessionId ?? 'eba9bf',
      timestamp: body.timestamp ?? Date.now(),
    })
    // frontend/ cwd -> repo root debug-eba9bf.log
    const candidates = [
      path.join(process.cwd(), '..', 'debug-eba9bf.log'),
      path.join(process.cwd(), 'debug-eba9bf.log'),
    ]
    let lastError: unknown = null
    for (const logPath of candidates) {
      try {
        await appendFile(logPath, `${line}\n`, 'utf8')
        return NextResponse.json({ ok: true, logPath })
      } catch (error) {
        lastError = error
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error: lastError instanceof Error ? lastError.message : 'write failed',
      },
      { status: 500 }
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'bad request' },
      { status: 400 }
    )
  }
}

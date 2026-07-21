import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { reportBulkResults, settleBulkActions } from './bulk-settle'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('reportBulkResults', () => {
  const t = vi.fn((key: string) => {
    if (key === 'common.bulkPartial') return '{failed} item(s) failed'
    if (key === 'common.bulkSuccess') return 'Updated {count} item(s)'
    return key
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows error toast when some actions fail', () => {
    reportBulkResults(t, 0, 2)
    expect(toast.error).toHaveBeenCalledWith('2 item(s) failed')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows success toast when some actions succeed', () => {
    reportBulkResults(t, 3, 0)
    expect(toast.success).toHaveBeenCalledWith('Updated 3 item(s)')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows both toasts on partial success', () => {
    reportBulkResults(t, 2, 1)
    expect(toast.error).toHaveBeenCalledWith('1 item(s) failed')
    expect(toast.success).toHaveBeenCalledWith('Updated 2 item(s)')
  })

  it('shows no toasts when both counts are zero', () => {
    reportBulkResults(t, 0, 0)
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('settleBulkActions', () => {
  it('counts successes and failures', async () => {
    const action = vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('fail')
    })

    const result = await settleBulkActions(['a', 'bad', 'c'], action)
    expect(result).toEqual({ succeeded: 2, failed: 1 })
    expect(action).toHaveBeenCalledTimes(3)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { settleBulkActions } from './bulk-settle'

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

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageRefreshButton } from './PageRefreshButton'

describe('PageRefreshButton', () => {
  it('renders with accessible refresh label and calls onClick', () => {
    const onClick = vi.fn()
    render(<PageRefreshButton onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'common.refresh' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('can be disabled', () => {
    render(<PageRefreshButton onClick={vi.fn()} disabled />)

    expect(screen.getByRole('button', { name: 'common.refresh' })).toBeDisabled()
  })
})

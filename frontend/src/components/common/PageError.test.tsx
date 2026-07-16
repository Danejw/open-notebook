import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageError, InlineError } from './PageError'

describe('PageError', () => {
  it('renders destructive title in an alert', () => {
    render(<PageError title="Failed to load sources" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load sources')
  })

  it('renders optional description and action', () => {
    render(
      <PageError
        title="Connection error"
        description="Unable to connect to the API."
        action={<button type="button">Retry</button>}
      />
    )

    expect(screen.getByText('Unable to connect to the API.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders muted tone without alert role', () => {
    render(
      <PageError
        title="Unable to load chat"
        description="Please refresh the page"
        tone="muted"
        centered
      />
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Unable to load chat')).toBeInTheDocument()
    expect(screen.getByText('Please refresh the page')).toBeInTheDocument()
  })
})

describe('InlineError', () => {
  it('renders inline destructive message', () => {
    render(<InlineError title="Invalid credentials" />)

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
  })
})

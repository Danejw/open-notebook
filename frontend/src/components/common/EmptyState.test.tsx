import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Inbox } from 'lucide-react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('should render title', () => {
    render(<EmptyState icon={Inbox} title="No items yet" />)

    expect(screen.getByRole('heading', { name: 'No items yet' })).toBeInTheDocument()
  })

  it('should render optional description when provided', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No items yet"
        description="Add your first item to get started."
      />
    )

    expect(screen.getByText('Add your first item to get started.')).toBeInTheDocument()
  })

  it('should not render description when omitted', () => {
    render(<EmptyState icon={Inbox} title="No items yet" />)

    expect(screen.queryByText('Add your first item to get started.')).not.toBeInTheDocument()
  })

  it('should render optional action when provided', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No items yet"
        action={<button type="button">Create item</button>}
      />
    )

    expect(screen.getByRole('button', { name: 'Create item' })).toBeInTheDocument()
  })

  it('should render a subtle variant without icon or dashed border', () => {
    render(
      <EmptyState
        variant="subtle"
        title="Start a conversation"
        className="px-2 py-3"
      />
    )

    expect(screen.getByText('Start a conversation')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

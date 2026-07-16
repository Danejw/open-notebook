import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DialogBodyLoading } from './LoadingSkeletons'

describe('DialogBodyLoading', () => {
  it('should render the loading label', () => {
    render(<DialogBodyLoading label="Loading content..." />)

    expect(screen.getByText('Loading content...')).toBeInTheDocument()
  })
})

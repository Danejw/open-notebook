import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FieldError } from './FieldError'

describe('FieldError', () => {
  it('should render nothing when message is not provided', () => {
    const { container } = render(<FieldError />)

    expect(container).toBeEmptyDOMElement()
  })

  it('should render nothing when message is empty', () => {
    const { container } = render(<FieldError message="" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('should render message when provided', () => {
    render(<FieldError message="This field is required" />)

    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('should render default variant as a button', () => {
    render(<Button>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('data-slot', 'button')
  })

  it('should render destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>)

    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('bg-destructive')
  })

  it('should render outline variant', () => {
    render(<Button variant="outline">Cancel</Button>)

    const button = screen.getByRole('button', { name: 'Cancel' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('border')
  })

  it('should support disabled state', () => {
    render(<Button disabled>Disabled</Button>)

    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled()
  })

  it('should render ghost icon size for toolbar controls', () => {
    render(
      <Button variant="ghost" size="icon" aria-label="More actions">
        ···
      </Button>
    )

    const button = screen.getByRole('button', { name: 'More actions' })
    expect(button).toBeInTheDocument()
    expect(button.className).toMatch(/size-7|h-7/)
  })

  it('should render asChild content', () => {
    render(
      <Button asChild>
        <a href="/projects">Open projects</a>
      </Button>
    )

    expect(screen.getByRole('link', { name: 'Open projects' })).toHaveAttribute(
      'href',
      '/projects'
    )
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('should render title', () => {
    render(<PageHeader title="Projects" />)

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })

  it('should render optional description when provided', () => {
    render(
      <PageHeader title="Projects" description="Manage your research projects." />
    )

    expect(screen.getByText('Manage your research projects.')).toBeInTheDocument()
  })

  it('should not render description when omitted', () => {
    render(<PageHeader title="Projects" />)

    expect(screen.queryByText('Manage your research projects.')).not.toBeInTheDocument()
  })

  it('should render optional actions when provided', () => {
    render(
      <PageHeader
        title="Projects"
        actions={<button type="button">New project</button>}
      />
    )

    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
  })
})

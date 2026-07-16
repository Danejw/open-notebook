import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormDialogShell } from './FormDialogShell'

describe('FormDialogShell', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Rename item',
    onSubmit: vi.fn((event) => event.preventDefault()),
    children: <input aria-label="Name" defaultValue="Alpha" />,
  }

  it('calls onOpen when the dialog opens', () => {
    const onOpen = vi.fn()
    const { rerender } = render(
      <FormDialogShell {...defaultProps} open={false} onOpen={onOpen} />,
    )

    expect(onOpen).not.toHaveBeenCalled()

    rerender(<FormDialogShell {...defaultProps} open onOpen={onOpen} />)

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('does not call onOpen while the dialog remains closed', () => {
    const onOpen = vi.fn()

    render(<FormDialogShell {...defaultProps} open={false} onOpen={onOpen} />)

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('submits the form when the save button is clicked', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())

    render(<FormDialogShell {...defaultProps} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('disables submit when disableSubmit is true', () => {
    render(<FormDialogShell {...defaultProps} disableSubmit />)

    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled()
  })

  it('disables submit and shows saving label while submitting', () => {
    render(<FormDialogShell {...defaultProps} isSubmitting />)

    expect(screen.getByRole('button', { name: 'common.saving' })).toBeDisabled()
    expect(screen.queryByText('common.save')).not.toBeInTheDocument()
  })

  it('calls onOpenChange(false) when cancel is clicked', () => {
    const onOpenChange = vi.fn()

    render(<FormDialogShell {...defaultProps} onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders footerLeft content alongside cancel and save', () => {
    render(
      <FormDialogShell
        {...defaultProps}
        footerLeft={<button type="button">Reset</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.save' })).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <FormDialogShell {...defaultProps} description="Rename the selected file" />,
    )

    expect(screen.getByText('Rename the selected file')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RenameFieldDialog } from './RenameFieldDialog'

describe('RenameFieldDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Rename item',
    label: 'Name',
    value: 'Alpha',
    onChange: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
  }

  it('renders the label and input with the current value', () => {
    render(<RenameFieldDialog {...defaultProps} inputId="rename-name" />)

    expect(screen.getByLabelText('Name')).toHaveValue('Alpha')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
      'id',
      'rename-name',
    )
  })

  it('disables submit when the primary value is empty', () => {
    render(<RenameFieldDialog {...defaultProps} value="   " />)

    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled()
  })

  it('calls onChange when the input changes', () => {
    const onChange = vi.fn()

    render(<RenameFieldDialog {...defaultProps} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Beta' },
    })

    expect(onChange).toHaveBeenCalledWith('Beta')
  })

  it('submits the form when save is clicked', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())

    render(<RenameFieldDialog {...defaultProps} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('renders optional description field and disables submit when empty', () => {
    render(
      <RenameFieldDialog
        {...defaultProps}
        descriptionLabel="Description"
        descriptionValue=""
        onDescriptionChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled()
  })

  it('calls onOpen when the dialog opens', () => {
    const onOpen = vi.fn()
    const { rerender } = render(
      <RenameFieldDialog {...defaultProps} open={false} onOpen={onOpen} />,
    )

    expect(onOpen).not.toHaveBeenCalled()

    rerender(<RenameFieldDialog {...defaultProps} open onOpen={onOpen} />)

    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

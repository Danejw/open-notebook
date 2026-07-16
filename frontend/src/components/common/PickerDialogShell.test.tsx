import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import {
  PickerDialogShell,
  PickerDialogActions,
  usePickerDialogDraft,
} from './PickerDialogShell'

describe('PickerDialogShell', () => {
  it('renders title, body content, and footer actions when open', () => {
    render(
      <PickerDialogShell
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Open picker</button>}
        title="Select items"
        footerLeft={<span>2 selected</span>}
        actions={<button type="button">Apply</button>}
      >
        <p>Picker body</p>
      </PickerDialogShell>,
    )

    expect(screen.getByText('Select items')).toBeInTheDocument()
    expect(screen.getByText('Picker body')).toBeInTheDocument()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })

  it('renders beforeBody content above the body', () => {
    render(
      <PickerDialogShell
        open
        onOpenChange={vi.fn()}
        title="Select items"
        beforeBody={<input aria-label="Search items" />}
        actions={<button type="button">Apply</button>}
      >
        <p>Picker body</p>
      </PickerDialogShell>,
    )

    expect(screen.getByLabelText('Search items')).toBeInTheDocument()
    expect(screen.getByText('Picker body')).toBeInTheDocument()
  })

  it('works without a trigger for externally controlled dialogs', () => {
    render(
      <PickerDialogShell
        open
        onOpenChange={vi.fn()}
        title="External open"
        actions={<button type="button">Apply</button>}
      >
        <p>Body</p>
      </PickerDialogShell>,
    )

    expect(screen.getByText('External open')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open picker' })).not.toBeInTheDocument()
  })
})

describe('PickerDialogActions', () => {
  it('calls onCancel and onSave when action buttons are clicked', () => {
    const onCancel = vi.fn()
    const onSave = vi.fn()

    render(
      <PickerDialogActions
        cancelLabel="Cancel"
        saveLabel="Save"
        onCancel={onCancel}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('disables save when saveDisabled is true', () => {
    render(
      <PickerDialogActions
        cancelLabel="Cancel"
        saveLabel="Save"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        saveDisabled
      />,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('usePickerDialogDraft', () => {
  it('starts closed with draft matching selected', () => {
    const { result } = renderHook(() => usePickerDialogDraft(['a']))

    expect(result.current.open).toBe(false)
    expect(result.current.draft).toEqual(['a'])
  })

  it('syncs draft from selected when the dialog opens', () => {
    const { result, rerender } = renderHook(
      ({ selected }: { selected: string[] }) => usePickerDialogDraft(selected),
      { initialProps: { selected: ['a'] } },
    )

    act(() => {
      result.current.setDraft(['modified'])
    })
    expect(result.current.draft).toEqual(['modified'])

    rerender({ selected: ['b', 'c'] })

    act(() => {
      result.current.handleOpenChange(true)
    })

    expect(result.current.open).toBe(true)
    expect(result.current.draft).toEqual(['b', 'c'])
  })

  it('does not reset draft while staying open', () => {
    const { result, rerender } = renderHook(
      ({ selected }: { selected: string[] }) => usePickerDialogDraft(selected),
      { initialProps: { selected: ['a'] } },
    )

    act(() => {
      result.current.handleOpenChange(true)
      result.current.setDraft(['picked'])
    })

    rerender({ selected: ['z'] })

    expect(result.current.open).toBe(true)
    expect(result.current.draft).toEqual(['picked'])
  })

  it('close sets open to false', () => {
    const { result } = renderHook(() => usePickerDialogDraft('item'))

    act(() => {
      result.current.handleOpenChange(true)
    })
    expect(result.current.open).toBe(true)

    act(() => {
      result.current.close()
    })
    expect(result.current.open).toBe(false)
  })
})

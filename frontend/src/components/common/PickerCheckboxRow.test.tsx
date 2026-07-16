import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PickerCheckboxRow } from './PickerCheckboxRow'

describe('PickerCheckboxRow', () => {
  it('toggles via the labeled checkbox', () => {
    const onCheckedChange = vi.fn()
    render(
      <PickerCheckboxRow
        id="skill-1"
        title="Research"
        description="Deep research skill"
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    )

    fireEvent.click(screen.getByRole('checkbox'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('Deep research skill')).toBeInTheDocument()
  })

  it('renders meta and footer slots', () => {
    render(
      <PickerCheckboxRow
        id="tool-1"
        title="Read file"
        checked
        onCheckedChange={vi.fn()}
        meta={<span>read</span>}
        footer={<span>Unavailable</span>}
      />
    )

    expect(screen.getByText('read')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('disables the checkbox when disabled', () => {
    render(
      <PickerCheckboxRow
        id="disabled-1"
        title="Blocked"
        checked={false}
        disabled
        onCheckedChange={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})

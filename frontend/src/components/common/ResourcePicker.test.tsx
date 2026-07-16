import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResourcePicker } from './ResourcePicker'

type Item = { id: string; name: string }

const items: Item[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
]

describe('ResourcePicker', () => {
  it('multi-select toggles draft and saves', () => {
    const onChange = vi.fn()
    render(
      <ResourcePicker
        selectionMode="multi"
        value={[]}
        onChange={onChange}
        title="Pick"
        trigger={<button type="button">Open</button>}
        items={items}
        getItemId={(item) => item.id}
        getItemProps={(item) => ({ title: item.name })}
        emptyTitle="Empty"
        cancelLabel="Cancel"
        saveLabel="Save"
        formatSelectedCount={(count) => `${count} selected`}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Alpha/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onChange).toHaveBeenCalledWith(['a'])
  })

  it('single-select is exclusive and supports clear', () => {
    const onChange = vi.fn()
    render(
      <ResourcePicker
        selectionMode="single"
        value={null}
        onChange={onChange}
        title="Pick one"
        trigger={<button type="button">Open</button>}
        items={items}
        getItemId={(item) => item.id}
        getItemProps={(item) => ({ title: item.name })}
        emptyTitle="Empty"
        cancelLabel="Cancel"
        saveLabel="Save"
        clearLabel="Clear"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Alpha/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Beta/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('cancel discards draft changes', () => {
    const onChange = vi.fn()
    render(
      <ResourcePicker
        selectionMode="multi"
        value={['a']}
        onChange={onChange}
        title="Pick"
        trigger={<button type="button">Open</button>}
        items={items}
        getItemId={(item) => item.id}
        getItemProps={(item) => ({ title: item.name })}
        emptyTitle="Empty"
        cancelLabel="Cancel"
        saveLabel="Save"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Beta/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clear empties single draft before save', () => {
    const onChange = vi.fn()
    render(
      <ResourcePicker
        selectionMode="single"
        value="a"
        onChange={onChange}
        title="Pick one"
        trigger={<button type="button">Open</button>}
        items={items}
        getItemId={(item) => item.id}
        getItemProps={(item) => ({ title: item.name })}
        emptyTitle="Empty"
        cancelLabel="Cancel"
        saveLabel="Save"
        clearLabel="Clear"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

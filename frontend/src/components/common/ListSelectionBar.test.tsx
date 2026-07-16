import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ListSelectionBar } from './ListSelectionBar'

describe('ListSelectionBar', () => {
  it('renders as a toolbar with the count label', () => {
    render(
      <ListSelectionBar count={3} countLabel="3 selected" onClear={vi.fn()} />
    )

    expect(screen.getByRole('toolbar', { name: '3 selected' })).toBeInTheDocument()
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('calls onClear from the accessible clear control', () => {
    const onClear = vi.fn()
    render(
      <ListSelectionBar count={2} countLabel="2 selected" onClear={onClear} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.clearSelection' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('renders select-all when onSelectAll is provided', () => {
    const onSelectAll = vi.fn()
    render(
      <ListSelectionBar
        count={1}
        countLabel="1 selected"
        onClear={vi.fn()}
        onSelectAll={onSelectAll}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.selectAll' }))
    expect(onSelectAll).toHaveBeenCalledTimes(1)
  })

  it('renders action children in the toolbar', () => {
    render(
      <ListSelectionBar count={1} countLabel="1 selected" onClear={vi.fn()}>
        <button type="button">Bulk delete</button>
      </ListSelectionBar>
    )

    expect(screen.getByRole('button', { name: 'Bulk delete' })).toBeInTheDocument()
  })
})

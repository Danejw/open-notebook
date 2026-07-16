import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResourceList } from './ResourceList'

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

type Item = { id: string; name: string }

const items: Item[] = [
  { id: '1', name: 'One' },
  { id: '2', name: 'Two' },
]

describe('ResourceList', () => {
  it('enters selection mode and select-all selects every row', () => {
    render(
      <ResourceList
        title="Items"
        items={items}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        bulkActions={() => <button type="button">Bulk</button>}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.selectMode' }))
    expect(screen.getByRole('button', { name: 'Bulk' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.selectAll' }))
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes.every((box) => box.getAttribute('aria-checked') === 'true')).toBe(true)
  })
})

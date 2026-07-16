import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollectionPicker } from './CollectionPicker'

const mockCatalog = vi.fn()

vi.mock('@/lib/hooks/use-collections', () => ({
  useCollectionsCatalog: () => mockCatalog(),
}))

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('CollectionPicker', () => {
  beforeEach(() => {
    mockCatalog.mockReturnValue({
      data: [
        {
          id: 'collection:1',
          name: 'Hawaii Authorities',
          description: 'Official Hawaii sources',
          slug: 'hawaii',
          tags: [],
          status: 'active',
          archived: false,
          item_count: 3,
        },
      ],
      isLoading: false,
    })
  })

  it('renders trigger and opens catalog', () => {
    const onChange = vi.fn()
    render(
      <CollectionPicker selectedCollectionIds={[]} onChange={onChange} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'collections.pickerLabel' }))
    expect(screen.getByText('collections.pickerTitle')).toBeInTheDocument()
    expect(screen.getByText('Hawaii Authorities')).toBeInTheDocument()
  })

  it('toggles selection in draft and saves', () => {
    const onChange = vi.fn()
    render(
      <CollectionPicker selectedCollectionIds={[]} onChange={onChange} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'collections.pickerLabel' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(onChange).toHaveBeenCalledWith(['collection:1'])
  })
})

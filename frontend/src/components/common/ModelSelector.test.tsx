import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModelSelector } from './ModelSelector'
import type { Model } from '@/lib/types/models'

const mockModels: Model[] = [
  {
    id: 'model-b',
    name: 'Beta Model',
    provider: 'openai',
    type: 'language',
    created: '2024-01-01',
    updated: '2024-01-01',
  },
  {
    id: 'model-a',
    name: 'Alpha Model',
    provider: 'anthropic',
    type: 'language',
    created: '2024-01-01',
    updated: '2024-01-01',
  },
  {
    id: 'embed-1',
    name: 'Embed One',
    provider: 'openai',
    type: 'embedding',
    created: '2024-01-01',
    updated: '2024-01-01',
  },
]

vi.mock('@/lib/hooks/use-models', () => ({
  useModels: vi.fn(),
}))

import { useModels } from '@/lib/hooks/use-models'

const mockedUseModels = vi.mocked(useModels)

describe('ModelSelector', () => {
  const onChange = vi.fn()
  const onClear = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mockedUseModels.mockReturnValue({
      data: mockModels,
      isLoading: false,
    } as ReturnType<typeof useModels>)
  })

  it('filters models by modelType from fetched data', () => {
    render(
      <ModelSelector
        label="Embedding"
        modelType="embedding"
        value="embed-1"
        onChange={onChange}
      />
    )

    expect(screen.getByText('Embedding')).toBeInTheDocument()
  })

  it('sorts models by name when sortByName is enabled', async () => {
    render(
      <ModelSelector
        label="Language"
        modelType="language"
        value="model-a"
        onChange={onChange}
        sortByName
        models={mockModels}
      />
    )

    fireEvent.click(screen.getByRole('combobox'))
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent('Alpha Model')
    expect(options[1]).toHaveTextContent('Beta Model')
  })

  it('applies invalid styling when required and value is missing', () => {
    render(
      <ModelSelector
        label="Chat Model"
        modelType="language"
        value=""
        onChange={onChange}
        required
        invalid
        models={mockModels}
      />
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveClass('border-destructive')
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows clear button and calls onClear when allowClear is enabled', () => {
    render(
      <ModelSelector
        label="Tools Model"
        modelType="language"
        value="model-a"
        onChange={onChange}
        allowClear
        onClear={onClear}
        models={mockModels}
        size="compact"
      />
    )

    const clearButton = screen.getAllByRole('button').find(
      (button) => button.querySelector('svg') && !button.hasAttribute('aria-controls')
    )
    expect(clearButton).toBeDefined()
    fireEvent.click(clearButton!)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('renders default option for override flows', () => {
    render(
      <ModelSelector
        label="common.model"
        modelType="language"
        value="default"
        onChange={onChange}
        models={mockModels}
        defaultOption={{
          value: 'default',
          label: 'common.default (Alpha Model)',
          provider: 'anthropic',
        }}
      />
    )

    expect(screen.getByText('common.model')).toBeInTheDocument()
    expect(screen.getByText('common.default (Alpha Model)')).toBeInTheDocument()
  })

  it('disables the select while models are loading', () => {
    mockedUseModels.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useModels>)

    render(
      <ModelSelector
        label="Language"
        modelType="language"
        value=""
        onChange={onChange}
      />
    )

    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})

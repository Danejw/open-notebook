import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraphToolbar } from '@/components/knowledge-graph/GraphToolbar'

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/lib/stores/knowledge-graph-store', () => ({
  NODE_SIZE_SCALE_DEFAULT: 1,
  NODE_SIZE_SCALE_MIN: 0.5,
  NODE_SIZE_SCALE_MAX: 2,
  useKnowledgeGraphStore: () => ({
    searchQuery: '',
    setSearchQuery: vi.fn(),
    provenanceMode: false,
    setProvenanceMode: vi.fn(),
    showLabels: true,
    setShowLabels: vi.fn(),
    nodeSizeScale: 1,
    setNodeSizeScale: vi.fn(),
    enabledKinds: ['source', 'community', 'entity', 'chunk', 'claim'],
    toggleKind: vi.fn(),
    minConfidence: 0,
    setMinConfidence: vi.fn(),
    pathPick: 'idle',
    viewMode: 'explore',
    setViewMode: vi.fn(),
    setQueryRunId: vi.fn(),
  }),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

describe('GraphToolbar bar layout', () => {
  const noop = () => undefined

  it('places leading top-left, trailing top-right, search bottom, tools without trailing inline', () => {
    const { container } = render(
      <div className="relative h-40 w-80">
        <GraphToolbar
          layout="bar"
          leading={<button type="button">LeadingTabs</button>}
          trailing={<button type="button">TrailingAdd</button>}
          onSearch={noop}
          onExpand={noop}
          onFindPath={noop}
          onResetView={noop}
          onFit={noop}
        />
      </div>
    )

    expect(screen.getByRole('button', { name: 'LeadingTabs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TrailingAdd' })).toBeInTheDocument()
    expect(screen.getByLabelText('knowledge.graphSearch')).toBeInTheDocument()

    const searchIsland = container.querySelector('[data-graph-toolbar="search"]')
    const toolsIsland = container.querySelector('[data-graph-toolbar="tools"]')
    const leadingIsland = container.querySelector('[data-graph-toolbar="leading"]')
    const trailingIsland = container.querySelector('[data-graph-toolbar="trailing"]')

    expect(searchIsland?.className).toMatch(/bottom-0/)
    expect(toolsIsland?.className).toMatch(/top-0/)
    expect(toolsIsland?.className).toMatch(/justify-center|inset-x-0/)
    expect(leadingIsland?.className).toMatch(/left-0/)
    expect(trailingIsland?.className).toMatch(/right-0/)
    expect(toolsIsland?.textContent).not.toContain('TrailingAdd')
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePathname } from 'next/navigation'
import { AppSidebar } from './AppSidebar'
import { useSidebarStore } from '@/lib/stores/sidebar-store'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: vi.fn(() => ''),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/hooks/use-route-prefetch', () => ({
  useRoutePrefetch: () => vi.fn(),
}))

vi.mock('@/lib/hooks/use-projects', () => ({
  useProjects: () => ({
    data: [{ id: 'proj-1', name: 'Test Project' }],
    isLoading: false,
  }),
}))

// Mock Tooltip components to avoid Radix UI async issues in tests
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function renderSidebar(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    createElement(QueryClientProvider, { client }, ui)
  )
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('')
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: false,
      toggleCollapse: vi.fn(),
    } as any)
  })

  it('renders correctly when expanded', () => {
    renderSidebar(<AppSidebar />)

    // With mocked t() returning keys, check for translation key strings
    expect(screen.getByText('common.appName')).toBeDefined()
    expect(screen.getByText('navigation.sources')).toBeDefined()
    expect(screen.getByText('navigation.projects')).toBeDefined()
  })

  it('toggles collapse state when clicking handle', () => {
    const toggleCollapse = vi.fn()
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: false,
      toggleCollapse,
    } as any)

    renderSidebar(<AppSidebar />)

    fireEvent.click(screen.getByRole('button', { name: 'navigation.collapseSidebar' }))

    expect(toggleCollapse).toHaveBeenCalled()
  })

  it('exposes an accessible name on the expanded sidebar toggle', () => {
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: false,
      toggleCollapse: vi.fn(),
    } as any)

    renderSidebar(<AppSidebar />)

    expect(screen.getByRole('button', { name: 'navigation.collapseSidebar' })).toBeDefined()
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute(
      'aria-label',
      'navigation.collapseSidebar'
    )
  })

  it('exposes an accessible name on the collapsed sidebar toggle', () => {
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: true,
      toggleCollapse: vi.fn(),
    } as any)

    renderSidebar(<AppSidebar />)

    expect(screen.getByRole('button', { name: 'navigation.expandSidebar' })).toBeDefined()
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute(
      'aria-label',
      'navigation.expandSidebar'
    )
  })

  it('shows collapsed view when isCollapsed is true', () => {
    vi.mocked(useSidebarStore).mockReturnValue({
      isCollapsed: true,
      toggleCollapse: vi.fn(),
    } as any)

    renderSidebar(<AppSidebar />)

    // In collapsed mode, app name shouldn't be visible (as text)
    expect(screen.queryByText('common.appName')).toBeNull()
  })

  it('sets aria-current="page" on the active sidebar nav link', () => {
    vi.mocked(usePathname).mockReturnValue('/sources')

    renderSidebar(<AppSidebar />)

    expect(screen.getByRole('link', { name: 'navigation.sources' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'navigation.podcasts' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('sets aria-current="page" on the active project nav link', () => {
    vi.mocked(usePathname).mockReturnValue('/projects/proj-1')

    renderSidebar(<AppSidebar />)

    expect(screen.getByRole('link', { name: 'Test Project' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('does not nest button elements inside sidebar nav links', () => {
    const { container } = renderSidebar(<AppSidebar />)

    container.querySelectorAll('nav a').forEach((link) => {
      expect(link.querySelector('button')).toBeNull()
    })
  })
})

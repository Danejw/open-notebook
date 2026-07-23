import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CitedMarkdownContent } from '@/components/common/CitedMarkdownContent'
import { ArtifactViewerDialog } from '@/app/(dashboard)/projects/components/ArtifactViewerDialog'

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'common.references': 'References',
        'common.source': 'Source',
        'common.note': 'Note',
        'common.noResults': 'No results',
      }
      return labels[key] ?? key
    },
  }),
}))

vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: ({
    children,
    components,
  }: {
    children: string
    components?: {
      a?: (props: {
        href?: string
        children?: ReactNode
      }) => ReactNode
    }
  }) => {
    const Link = components?.a
    const refLinks = [...children.matchAll(/\[([^\]]+)\]\((#ref-[^)]+)\)/g)]
    return (
      <div data-testid="markdown-body">
        <span data-testid="markdown-raw">{children}</span>
        {Link
          ? refLinks.map((match, index) => (
              <div key={`${match[2]}-${index}`}>
                {Link({ href: match[2], children: match[1] })}
              </div>
            ))
          : null}
      </div>
    )
  },
}))

const openModal = vi.fn()
const openWithFocus = vi.fn()

vi.mock('@/lib/hooks/use-modal-manager', () => ({
  useModalManager: () => ({ openModal }),
}))

vi.mock('@/lib/stores/citation-focus-store', () => ({
  useCitationFocusStore: {
    getState: () => ({ openWithFocus }),
  },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

describe('CitedMarkdownContent', () => {
  it('invokes onReferenceClick when a citation link is clicked', () => {
    const onReferenceClick = vi.fn()

    render(
      <CitedMarkdownContent
        content="See [source:abc123] for details."
        onReferenceClick={onReferenceClick}
      />
    )

    expect(screen.getByTestId('markdown-raw').textContent).toContain(
      '#ref-source-abc123'
    )

    fireEvent.click(screen.getByRole('button', { name: '1' }))
    expect(onReferenceClick).toHaveBeenCalledWith('source', 'abc123')
  })
})

describe('ArtifactViewerDialog citations', () => {
  beforeEach(() => {
    openModal.mockClear()
    openWithFocus.mockClear()
  })

  it('opens the source modal when a citation is clicked', () => {
    render(
      <ArtifactViewerDialog
        open
        onOpenChange={vi.fn()}
        displayNote={{
          id: 'note:1',
          title: 'Saved chat answer',
          content: 'Claim supported by [source:src99].',
          artifact_kind: 'generated',
          note_type: 'generated',
          created: '2026-01-01T00:00:00Z',
          updated: '2026-01-01T00:00:00Z',
        }}
        isLoading={false}
        t={(key: string) => key}
        onExportPdf={vi.fn()}
        onExportMarkdown={vi.fn()}
        onIngest={vi.fn()}
        onEdit={vi.fn()}
        exportPdfPending={false}
        ingestPending={false}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '1' }))
    expect(openWithFocus).toHaveBeenCalledWith('src99')
    expect(openModal).toHaveBeenCalledWith('source', 'src99')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Zap } from 'lucide-react'
import {
  CompactListRow,
  CompactListRowActions,
  CompactListRowContent,
  CompactListRowIcon,
  CompactListRowMeta,
  CompactListRowTitle,
  CompactListRowTitleRow,
} from './CompactListRow'

describe('CompactListRow', () => {
  it('renders a row-level link with an accessible name when href is provided', () => {
    render(
      <CompactListRow href="/skills/skill-1">
        <CompactListRowIcon>
          <Zap aria-hidden />
        </CompactListRowIcon>
        <CompactListRowContent>
          <CompactListRowTitleRow>
            <CompactListRowTitle>Research Assistant</CompactListRowTitle>
          </CompactListRowTitleRow>
          <CompactListRowMeta>3 files</CompactListRowMeta>
        </CompactListRowContent>
      </CompactListRow>,
    )

    const link = screen.getByRole('link', { name: /Research Assistant/i })
    expect(link).toHaveAttribute('href', '/skills/skill-1')
  })

  it('renders a title link when the row is static and title href is provided', () => {
    render(
      <CompactListRow as="li">
        <CompactListRowContent>
          <CompactListRowTitleRow>
            <CompactListRowTitle href="/projects/project-1">Alpha Project</CompactListRowTitle>
          </CompactListRowTitleRow>
        </CompactListRowContent>
        <CompactListRowActions>
          <button type="button">Actions</button>
        </CompactListRowActions>
      </CompactListRow>,
    )

    const link = screen.getByRole('link', { name: 'Alpha Project' })
    expect(link).toHaveAttribute('href', '/projects/project-1')
    expect(link.tagName).toBe('A')
  })

  it('does not nest links when the row itself is navigable', () => {
    render(
      <CompactListRow href="/skills/skill-2">
        <CompactListRowContent>
          <CompactListRowTitleRow>
            <CompactListRowTitle href="/skills/ignored">Beta Skill</CompactListRowTitle>
          </CompactListRowTitleRow>
        </CompactListRowContent>
      </CompactListRow>,
    )

    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Beta Skill' })).toHaveAttribute(
      'href',
      '/skills/skill-2',
    )
  })

  it('activates onClick rows with Enter and Space when href is not set', () => {
    const onClick = vi.fn()

    render(
      <CompactListRow onClick={onClick}>
        <CompactListRowContent>
          <CompactListRowTitleRow>
            <CompactListRowTitle>Clickable Row</CompactListRowTitle>
          </CompactListRowTitleRow>
        </CompactListRowContent>
      </CompactListRow>,
    )

    const row = screen.getByRole('button', { name: /Clickable Row/i })
    expect(row).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(row, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(2)

    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('does not add button semantics when onClick is not provided', () => {
    render(
      <CompactListRow as="li">
        <CompactListRowContent>
          <CompactListRowTitleRow>
            <CompactListRowTitle>Static Row</CompactListRowTitle>
          </CompactListRowTitleRow>
        </CompactListRowContent>
      </CompactListRow>,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Static Row').closest('li')).not.toHaveAttribute('tabindex')
  })
})

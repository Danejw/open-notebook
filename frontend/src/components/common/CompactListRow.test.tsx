import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})

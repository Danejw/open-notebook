import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphControlsHelp } from '@/components/knowledge-graph/GraphControlsHelp'

vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'knowledge.graphControls': 'Controls',
        'knowledge.graphControlRotateGesture': 'Drag',
        'knowledge.graphControlRotate': 'Rotate',
        'knowledge.graphControlZoomGesture': 'Scroll',
        'knowledge.graphControlZoom': 'Zoom',
        'knowledge.graphControlSelectGesture': 'Click',
        'knowledge.graphControlSelect': 'Select',
        'knowledge.graphControlPanGesture': 'Right-drag',
        'knowledge.graphControlPan': 'Pan',
        'knowledge.graphControlFitResetGesture': 'Toolbar',
        'knowledge.graphControlToolbar': 'Fit / reset',
      }
      return map[key] ?? key
    },
  }),
}))

describe('GraphControlsHelp', () => {
  it('renders collapsed as icon-only button labeled Controls', () => {
    render(<GraphControlsHelp />)
    const btn = screen.getByRole('button', { name: 'Controls' })
    expect(btn).toBeInTheDocument()
    expect(btn.textContent?.replace(/\s/g, '')).not.toMatch(/Controls/)
  })

  it('expands to show gesture list when clicked', () => {
    render(<GraphControlsHelp />)
    fireEvent.click(screen.getByRole('button', { name: 'Controls' }))
    expect(screen.getByText('Rotate')).toBeInTheDocument()
  })
})

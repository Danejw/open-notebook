import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog'

describe('Dialog', () => {
  it('renders title and content when open', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit source</DialogTitle>
            <DialogDescription>Update source metadata</DialogDescription>
          </DialogHeader>
          <p>Dialog body</p>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Edit source')).toBeInTheDocument()
    expect(screen.getByText('Dialog body')).toBeInTheDocument()
  })

  it('does not render content when closed', () => {
    render(
      <Dialog open={false} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hidden</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('exposes a close control with an accessible name', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Closeable</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument()
  })

  it('can hide the close button', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>No close</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument()
  })

  it('notifies onOpenChange when close is clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Closeable</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

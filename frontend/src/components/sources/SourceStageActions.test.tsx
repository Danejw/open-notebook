import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SourceStageActions } from '@/components/sources/SourceStageActions'

describe('SourceStageActions', () => {
  it('shows details, isolates card clicks, and retries the failed stage', async () => {
    const onCardClick = vi.fn()
    const onRunEmbeddings = vi.fn()
    render(
      <div onClick={onCardClick}>
        <SourceStageActions
          embedState="failed"
          kgState="idle"
          extractReady={true}
          embedBusy={false}
          kgBusy={false}
          embedFailure={{
            stage: 'embedding',
            message: 'Embedding provider rejected the batch',
            error_type: 'RuntimeError',
            occurred_at: '2026-07-14T01:00:00Z',
            command_id: 'command:embed',
          }}
          onRunEmbeddings={onRunEmbeddings}
          onRunKnowledgeGraph={vi.fn()}
        />
      </div>
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'sources.embeddingsFailed' })
    )

    expect(
      screen.getByText('Embedding provider rejected the batch')
    ).toBeInTheDocument()
    expect(screen.getByText('RuntimeError')).toBeInTheDocument()
    expect(screen.getByText('command:embed')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'sources.retry' })
    ).toBeInTheDocument()
    expect(onCardClick).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'sources.retry' }))
    await waitFor(() =>
      expect(
        screen.getByText('sources.embeddingsConfirmTitle')
      ).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }))

    await waitFor(() => expect(onRunEmbeddings).toHaveBeenCalledOnce())
    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('shows an explicit unavailable message for an orphaned failure', () => {
    render(
      <SourceStageActions
        embedState="failed"
        kgState="idle"
        extractReady={true}
        embedBusy={false}
        kgBusy={false}
        failureDetailsUnavailable={true}
        onRunEmbeddings={vi.fn()}
        onRunKnowledgeGraph={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'sources.embeddingsFailed' })
    )

    expect(
      screen.getByText('sources.failureDetailsUnavailable')
    ).toBeInTheDocument()
  })
})

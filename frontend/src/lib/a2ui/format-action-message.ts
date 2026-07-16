import type { A2uiClientAction } from '@a2ui/web_core/v0_9'

/**
 * Build a follow-up chat message from an A2UI client action.
 */
export function formatA2uiActionMessage(action: A2uiClientAction): string {
  const name = action.name
  const context = action.context || {}
  const missingNote =
    typeof context.missingNote === 'string' ? context.missingNote.trim() : ''
  const sourceCount =
    typeof context.sourceCount === 'number'
      ? context.sourceCount
      : typeof context.sourceCount === 'string'
        ? context.sourceCount
        : undefined

  if (name === 'confirm_context') {
    const parts = [
      '[A2UI:confirm_context] Context confirmed.',
      sourceCount != null ? `Sources in context: ${sourceCount}.` : null,
      missingNote ? `User note: ${missingNote}` : null,
      'Please continue with the answer using this context.',
    ]
    return parts.filter(Boolean).join(' ')
  }

  if (name === 'refine_context') {
    const parts = [
      '[A2UI:refine_context] Please refine the retrieved context.',
      missingNote ? `Guidance: ${missingNote}` : 'Ask me what to adjust.',
    ]
    return parts.filter(Boolean).join(' ')
  }

  return `[A2UI:${name}] ${JSON.stringify(context)}`
}

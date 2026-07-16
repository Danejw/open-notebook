import type { A2uiClientAction } from '@a2ui/web_core/v0_9'

/**
 * Build a follow-up chat message from an A2UI client action (wire format for the agent).
 */
export function formatA2uiActionMessage(action: A2uiClientAction): string {
  const name = action.name
  const context = action.context || {}

  if (name === 'ask_user_answer') {
    const question =
      typeof context.question === 'string' ? context.question.trim() : ''
    const answer =
      typeof context.answer === 'string'
        ? context.answer.trim()
        : typeof context.customText === 'string' && context.customText.trim()
          ? context.customText.trim()
          : typeof context.optionLabel === 'string'
            ? context.optionLabel.trim()
            : ''
    const optionId =
      typeof context.optionId === 'string' ? context.optionId.trim() : ''

    const parts = [
      '[A2UI:ask_user_answer] User answered a clarifying question.',
      question ? `Question: ${question}` : null,
      answer ? `Answer: ${answer}` : null,
      optionId ? `Option id: ${optionId}.` : null,
      'Continue with this clarification in mind.',
    ]
    return parts.filter(Boolean).join(' ')
  }

  return `[A2UI:${name}] ${JSON.stringify(context)}`
}

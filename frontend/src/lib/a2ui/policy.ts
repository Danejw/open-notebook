import {
  A2UI_MAX_MESSAGES,
  A2UI_MAX_PAYLOAD_CHARS,
  BASIC_CATALOG_ID,
  COS_CATALOG_ID,
} from '@/lib/a2ui/constants'
import type { A2uiServerMessage } from '@/lib/a2ui/types'

/** Components allowed in Cos catalog surfaces (Basic + Cos). */
export const ALLOWED_COMPONENT_NAMES = new Set([
  // Basic layout / content / input
  'Row',
  'Column',
  'List',
  'Card',
  'Tabs',
  'Modal',
  'Divider',
  'Text',
  'Image',
  'Icon',
  'Video',
  'AudioPlayer',
  'Button',
  'TextField',
  'CheckBox',
  'ChoicePicker',
  'Slider',
  'DateTimeInput',
  // Cos semantic
  'AskUser',
])

const ALLOWED_CATALOG_IDS = new Set([COS_CATALOG_ID, BASIC_CATALOG_ID])

export class A2uiPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'A2uiPolicyError'
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function scanForUnsafeUrls(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (
      /^(javascript|data|vbscript):/i.test(value.trim()) ||
      (value.includes('://') && !isHttpUrl(value) && !value.startsWith('/'))
    ) {
      throw new A2uiPolicyError(`Unsafe URL at ${path}`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForUnsafeUrls(item, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      scanForUnsafeUrls(child, `${path}.${key}`)
    }
  }
}

/**
 * Validate A2UI messages before handing them to the MessageProcessor.
 */
export function validateA2uiMessages(messages: A2uiServerMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new A2uiPolicyError('A2UI payload must be a non-empty message array')
  }
  if (messages.length > A2UI_MAX_MESSAGES) {
    throw new A2uiPolicyError(
      `A2UI payload exceeds message budget (${A2UI_MAX_MESSAGES})`
    )
  }

  const serialized = JSON.stringify(messages)
  if (serialized.length > A2UI_MAX_PAYLOAD_CHARS) {
    throw new A2uiPolicyError(
      `A2UI payload exceeds size budget (${A2UI_MAX_PAYLOAD_CHARS} chars)`
    )
  }

  for (const message of messages) {
    if (!message || message.version !== 'v0.9') {
      throw new A2uiPolicyError('Only A2UI v0.9 messages are supported')
    }

    if (message.createSurface) {
      const { catalogId, surfaceId } = message.createSurface
      if (!surfaceId || typeof surfaceId !== 'string') {
        throw new A2uiPolicyError('createSurface requires surfaceId')
      }
      if (!ALLOWED_CATALOG_IDS.has(catalogId)) {
        throw new A2uiPolicyError(`Unsupported catalogId: ${catalogId}`)
      }
    }

    if (message.updateComponents?.components) {
      for (const component of message.updateComponents.components) {
        const name = component.component
        if (typeof name !== 'string' || !ALLOWED_COMPONENT_NAMES.has(name)) {
          throw new A2uiPolicyError(`Unregistered component: ${String(name)}`)
        }
      }
    }

    scanForUnsafeUrls(message, 'message')
  }
}

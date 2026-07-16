/**
 * A2UI v0.9.1 protocol pins and feature flags for Construction OS chat.
 */

export const A2UI_PROTOCOL_VERSION = 'v0.9' as const

/** AG-UI CUSTOM event name carrying A2UI JSONL / message arrays. */
export const A2UI_EVENT = 'a2ui'

/** Official Basic Catalog ID (used when composing Cos catalog). */
export const BASIC_CATALOG_ID =
  'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'

/** Construction OS catalog ID — Basic + AskUser. */
export const COS_CATALOG_ID =
  'https://www.construction-os.ai/a2ui/catalogs/cos/v1/catalog.json'

/** Prefix for AskUser surfaces (full id is unique per turn). */
export const ASK_USER_SURFACE_PREFIX = 'ask-user'

/** Max A2UI messages accepted in one CUSTOM payload. */
export const A2UI_MAX_MESSAGES = 50

/** Max serialized payload size (chars) for one CUSTOM event. */
export const A2UI_MAX_PAYLOAD_CHARS = 100_000

/**
 * Frontend feature flag. Enable with NEXT_PUBLIC_A2UI_CHAT=1 (or true).
 */
export function isA2uiChatEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_A2UI_CHAT
  if (!value) {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

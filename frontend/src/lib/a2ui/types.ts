import type { A2uiClientAction } from '@a2ui/web_core/v0_9'

/** One A2UI server→client message (v0.9 shape). */
export type A2uiServerMessage = {
  version: 'v0.9'
  createSurface?: {
    surfaceId: string
    catalogId: string
    sendDataModel?: boolean
  }
  updateComponents?: {
    surfaceId: string
    components: Array<Record<string, unknown> & { id: string; component: string }>
  }
  updateDataModel?: {
    surfaceId: string
    path?: string
    value?: unknown
  }
  deleteSurface?: {
    surfaceId: string
  }
}

export type A2uiActionHandler = (
  action: A2uiClientAction,
  messageId: string | null
) => void | Promise<void>

export type A2uiPayload = A2uiServerMessage[]

import type { AgUiEvent } from '@/lib/ag-ui/events'
import { A2UI_EVENT } from '@/lib/a2ui/constants'
import {
  parseA2uiCustomEvent,
  type ParsedA2uiCustomEvent,
} from '@/lib/a2ui/parse-a2ui-event'

export { A2UI_EVENT }

export function parseA2uiEvent(event: AgUiEvent): ParsedA2uiCustomEvent | null {
  return parseA2uiCustomEvent(event)
}

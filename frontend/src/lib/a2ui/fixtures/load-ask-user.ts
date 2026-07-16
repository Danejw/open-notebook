import { COS_CATALOG_ID } from '@/lib/a2ui/constants'
import type { A2uiServerMessage } from '@/lib/a2ui/types'

/**
 * Dev fixture: AskUser surface with a unique surfaceId per load.
 */
export function loadAskUserFixture(): A2uiServerMessage[] {
  const surfaceId = `ask-user-fixture-${Date.now().toString(36)}`
  return [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId,
        catalogId: COS_CATALOG_ID,
        sendDataModel: true,
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'Column',
            children: ['ask-user'],
          },
          {
            id: 'ask-user',
            component: 'AskUser',
            question: { path: '/question' },
            options: { path: '/options' },
            customValue: { path: '/customText' },
            selectedOptionId: { path: '/selectedOptionId' },
            customPlaceholder: 'Or type your own answer…',
            submitLabel: 'Submit answer',
          },
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path: '/',
        value: {
          question: 'What should we dig into next?',
          customText: '',
          selectedOptionId: '',
          options: [
            {
              id: 'scope',
              label: 'Summarize trade scopes',
              recommended: true,
            },
            {
              id: 'gaps',
              label: 'Find scope gaps / exclusions',
              recommended: false,
            },
            {
              id: 'bid',
              label: 'Help build a bid checklist',
              recommended: false,
            },
          ],
        },
      },
    },
  ]
}

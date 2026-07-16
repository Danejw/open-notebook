import type { A2uiServerMessage } from '@/lib/a2ui/types'
import { COS_CATALOG_ID } from '@/lib/a2ui/constants'

/**
 * Build a context-confirm fixture with a unique surfaceId per load.
 * Reusing a fixed id causes MessageProcessor "Surface X already exists" on re-apply.
 */
export function loadContextConfirmFixture(): A2uiServerMessage[] {
  const surfaceId = `context-confirm-fixture-${Date.now().toString(36)}`
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
            children: ['title', 'source-list', 'missing-field', 'confirm-actions'],
          },
          {
            id: 'title',
            component: 'Text',
            text: { path: '/title' },
            variant: 'h3',
          },
          {
            id: 'source-list',
            component: 'SourceChipList',
            title: 'Sources in context',
            sources: { path: '/sources' },
          },
          {
            id: 'missing-field',
            component: 'MissingFieldForm',
            label: 'Anything missing?',
            hint: 'Optional note for the assistant',
            value: { path: '/missingNote' },
          },
          {
            id: 'confirm-actions',
            component: 'ConfirmActions',
            confirmLabel: 'Confirm context',
            refineLabel: 'Refine',
            onConfirm: {
              event: {
                name: 'confirm_context',
                context: {
                  missingNote: { path: '/missingNote' },
                  sourceCount: { path: '/sourceCount' },
                },
              },
            },
            onRefine: {
              event: {
                name: 'refine_context',
                context: {
                  missingNote: { path: '/missingNote' },
                },
              },
            },
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
          title: 'Confirm context for this answer',
          sourceCount: 2,
          missingNote: '',
          sources: [
            {
              id: 'source:demo-1',
              title: 'Site logistics plan',
              kind: 'source',
            },
            {
              id: 'source:demo-2',
              title: 'Bid addendum 3',
              kind: 'source',
            },
          ],
        },
      },
    },
  ]
}

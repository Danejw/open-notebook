import { describe, expect, it } from 'vitest'
import {
  collectionItemsFromBulkInput,
  parseCollectionEntryStrings,
} from '@/lib/utils/collection-entries'

describe('parseCollectionEntryStrings', () => {
  it('splits on commas and newlines, trims, and dedupes', () => {
    expect(
      parseCollectionEntryStrings('236220, 238210,\n237310, 236220')
    ).toEqual(['236220', '238210', '237310'])
  })

  it('skips empty segments', () => {
    expect(parseCollectionEntryStrings('a,, ,b\n\n')).toEqual(['a', 'b'])
  })
})

describe('collectionItemsFromBulkInput', () => {
  it('builds text items and sets url when value is a link', () => {
    const items = collectionItemsFromBulkInput(
      '236220, https://example.gov/path'
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'text',
      title: '236220',
      url: null,
    })
    expect(items[1]).toMatchObject({
      type: 'text',
      title: 'https://example.gov/path',
      url: 'https://example.gov/path',
    })
  })

  it('skips titles already present', () => {
    const existing = collectionItemsFromBulkInput('236220')
    const added = collectionItemsFromBulkInput('236220, 238210', existing)
    expect(added).toHaveLength(1)
    expect(added[0]?.title).toBe('238210')
  })
})

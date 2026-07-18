import type { CollectionItem } from '@/lib/types/collections'

/** Split bulk collection input on commas and newlines; trim, skip empties, dedupe. */
export function parseCollectionEntryStrings(raw: string): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const part of raw.split(/[,\n]+/)) {
    const value = part.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    values.push(value)
  }
  return values
}

function slugifyItemId(value: string, index: number): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `item-${index + 1}`
}

function uniqueItemId(base: string, existingIds: Set<string>): string {
  let itemId = base
  let suffix = 2
  while (existingIds.has(itemId)) {
    itemId = `${base}-${suffix}`
    suffix += 1
  }
  return itemId
}

/** Build a text collection item from a plain string value. */
export function collectionItemFromString(
  value: string,
  index: number,
  existingIds: Set<string>
): CollectionItem {
  const title = value.trim()
  const isUrl = /^https?:\/\//i.test(title)
  const baseId = slugifyItemId(title, index)
  const itemId = uniqueItemId(baseId, existingIds)
  existingIds.add(itemId)
  return {
    item_id: itemId,
    type: 'text',
    title,
    url: isUrl ? title : null,
    description: '',
    tags: [],
    topics: [],
    enabled: true,
    sort_order: index,
  }
}

/** Convert bulk raw text into collection items, skipping titles already present. */
export function collectionItemsFromBulkInput(
  raw: string,
  existingItems: CollectionItem[] = []
): CollectionItem[] {
  const existingIds = new Set(existingItems.map((item) => item.item_id))
  const existingTitles = new Set(
    existingItems.map((item) => item.title.trim()).filter(Boolean)
  )
  const values = parseCollectionEntryStrings(raw).filter(
    (value) => !existingTitles.has(value)
  )
  return values.map((value, index) =>
    collectionItemFromString(value, existingItems.length + index, existingIds)
  )
}

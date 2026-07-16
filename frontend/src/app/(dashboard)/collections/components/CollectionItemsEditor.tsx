'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { CollectionItem } from '@/lib/types/collections'
import { useTranslation } from '@/lib/hooks/use-translation'

function slugifyItemId(value: string, index: number): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `item-${index + 1}`
}

interface CollectionItemsEditorProps {
  items: CollectionItem[]
  onChange: (items: CollectionItem[]) => void
  disabled?: boolean
}

export function CollectionItemsEditor({
  items,
  onChange,
  disabled = false,
}: CollectionItemsEditorProps) {
  const { t } = useTranslation()
  const [pasteInput, setPasteInput] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newUrl, setNewUrl] = useState('')

  const updateItem = (index: number, patch: Partial<CollectionItem>) => {
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    )
  }

  const removeItem = (index: number) => {
    onChange(
      items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, sortIndex) => ({ ...item, sort_order: sortIndex }))
    )
  }

  const addItem = () => {
    const title = newTitle.trim()
    const url = newUrl.trim()
    if (!title || !url) return
    const itemId = slugifyItemId(title, items.length)
    const existingIds = new Set(items.map((item) => item.item_id))
    let uniqueId = itemId
    let suffix = 2
    while (existingIds.has(uniqueId)) {
      uniqueId = `${itemId}-${suffix}`
      suffix += 1
    }
    onChange([
      ...items,
      {
        item_id: uniqueId,
        type: 'url',
        title,
        url,
        description: '',
        tags: [],
        topics: [],
        enabled: true,
        sort_order: items.length,
      },
    ])
    setNewTitle('')
    setNewUrl('')
  }

  const pasteUrls = () => {
    const lines = pasteInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) return

    const existingIds = new Set(items.map((item) => item.item_id))
    const nextItems = [...items]
    lines.forEach((line, lineIndex) => {
      let title = line
      let url = line
      const parts = line.split(/\s+/)
      if (parts.length > 1 && /^https?:\/\//i.test(parts[parts.length - 1])) {
        url = parts[parts.length - 1]
        title = parts.slice(0, -1).join(' ')
      }
      let itemId = slugifyItemId(title || `item-${nextItems.length + 1}`, nextItems.length)
      let suffix = 2
      while (existingIds.has(itemId)) {
        itemId = `${itemId}-${suffix}`
        suffix += 1
      }
      existingIds.add(itemId)
      nextItems.push({
        item_id: itemId,
        type: 'url',
        title: title || url,
        url,
        description: '',
        tags: [],
        topics: [],
        enabled: true,
        sort_order: nextItems.length,
      })
    })
    onChange(nextItems.map((item, index) => ({ ...item, sort_order: index })))
    setPasteInput('')
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border">
        <div className="border-b px-3 py-2 text-sm font-semibold">
          {t('collections.itemsTitle')}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('collections.noItems')}</p>
        ) : (
          <div className="divide-y">
            {items.map((item, index) => (
              <div
                key={`${item.item_id}-${index}`}
                className="grid gap-2 px-3 py-3 md:grid-cols-[auto_1fr_1fr_auto]"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={item.enabled}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      updateItem(index, { enabled: checked === true })
                    }
                    aria-label={t('collections.toggleItem')}
                  />
                </div>
                <Input
                  value={item.title}
                  disabled={disabled}
                  onChange={(e) => updateItem(index, { title: e.target.value })}
                  placeholder={t('collections.itemTitle')}
                />
                <Input
                  value={item.url ?? ''}
                  disabled={disabled}
                  onChange={(e) => updateItem(index, { url: e.target.value })}
                  placeholder={t('collections.itemUrl')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={disabled}
                  onClick={() => removeItem(index)}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <p className="text-sm font-medium">{t('collections.addItem')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={newTitle}
            disabled={disabled}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('collections.itemTitle')}
          />
          <Input
            value={newUrl}
            disabled={disabled}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={t('collections.itemUrl')}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !newTitle.trim() || !newUrl.trim()}
          onClick={addItem}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('collections.addItem')}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="collection-paste-urls">{t('collections.pasteUrls')}</Label>
        <Textarea
          id="collection-paste-urls"
          value={pasteInput}
          disabled={disabled}
          onChange={(e) => setPasteInput(e.target.value)}
          placeholder={t('collections.urlsPlaceholder')}
          rows={5}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !pasteInput.trim()}
          onClick={pasteUrls}
        >
          {t('collections.pasteUrlsConfirm')}
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CollectionItem } from '@/lib/types/collections'
import { useTranslation } from '@/lib/hooks/use-translation'

type SupportedItemType = 'url' | 'naics'

function slugifyItemId(value: string, index: number): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `item-${index + 1}`
}

function naicsCode(item: CollectionItem): string {
  const metadataCode = item.metadata?.naics_code
  return typeof metadataCode === 'string' ? metadataCode : item.item_id
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
  const [newType, setNewType] = useState<SupportedItemType>('url')
  const [newTitle, setNewTitle] = useState('')
  const [newValue, setNewValue] = useState('')

  const updateItem = (index: number, patch: Partial<CollectionItem>) => {
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    )
  }

  const updateItemType = (index: number, type: SupportedItemType) => {
    const item = items[index]
    if (type === 'naics') {
      const code = naicsCode(item).replace(/\D/g, '').slice(0, 6)
      updateItem(index, {
        type,
        item_id: code || item.item_id,
        url: null,
        metadata: { ...(item.metadata ?? {}), naics_code: code },
      })
      return
    }
    updateItem(index, { type, metadata: null })
  }

  const updateNaicsCode = (index: number, value: string) => {
    const code = value.replace(/\D/g, '').slice(0, 6)
    const item = items[index]
    updateItem(index, {
      item_id: code,
      metadata: { ...(item.metadata ?? {}), naics_code: code },
    })
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
    const value = newValue.trim()
    if (!title || !value) return

    if (newType === 'naics') {
      const code = value.replace(/\D/g, '').slice(0, 6)
      if (code.length < 2) return
      onChange([
        ...items,
        {
          item_id: code,
          type: 'naics',
          title,
          url: null,
          description: '',
          tags: ['naics'],
          topics: ['opportunity-discovery'],
          enabled: true,
          metadata: { naics_code: code },
          sort_order: items.length,
        },
      ])
    } else {
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
          url: value,
          description: '',
          tags: [],
          topics: [],
          enabled: true,
          sort_order: items.length,
        },
      ])
    }

    setNewTitle('')
    setNewValue('')
  }

  const pasteUrls = () => {
    const lines = pasteInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) return

    const existingIds = new Set(items.map((item) => item.item_id))
    const nextItems = [...items]
    lines.forEach((line) => {
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
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-md border">
        {items.length === 0 ? (
          <p className="px-1.5 py-2 text-sm text-muted-foreground">{t('collections.noItems')}</p>
        ) : (
          <div className="divide-y">
            {items.map((item, index) => {
              const type: SupportedItemType = item.type === 'naics' ? 'naics' : 'url'
              return (
                <div
                  key={`${item.item_id}-${index}`}
                  className="grid gap-1 px-1.5 py-1.5 md:grid-cols-[auto_105px_1fr_1fr_auto]"
                >
                  <div className="flex items-center">
                    <Checkbox
                      checked={item.enabled}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        updateItem(index, { enabled: checked === true })
                      }
                      aria-label={t('collections.toggleItem')}
                    />
                  </div>
                  <Select
                    value={type}
                    onValueChange={(value) => updateItemType(index, value as SupportedItemType)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="naics">NAICS</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={item.title}
                    disabled={disabled}
                    onChange={(event) => updateItem(index, { title: event.target.value })}
                    placeholder={t('collections.itemTitle')}
                  />
                  {type === 'naics' ? (
                    <Input
                      inputMode="numeric"
                      value={naicsCode(item)}
                      disabled={disabled}
                      onChange={(event) => updateNaicsCode(index, event.target.value)}
                      placeholder="NAICS code"
                    />
                  ) : (
                    <Input
                      value={item.url ?? ''}
                      disabled={disabled}
                      onChange={(event) => updateItem(index, { url: event.target.value })}
                      placeholder={t('collections.itemUrl')}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={disabled}
                    onClick={() => removeItem(index)}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-1 rounded-md border p-1.5">
        <p className="text-sm font-medium">{t('collections.addItem')}</p>
        <div className="grid gap-1 md:grid-cols-[105px_1fr_1fr]">
          <Select
            value={newType}
            onValueChange={(value) => {
              setNewType(value as SupportedItemType)
              setNewValue('')
            }}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="url">URL</SelectItem>
              <SelectItem value="naics">NAICS</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={newTitle}
            disabled={disabled}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder={newType === 'naics' ? 'Industry name' : t('collections.itemTitle')}
          />
          <Input
            value={newValue}
            disabled={disabled}
            inputMode={newType === 'naics' ? 'numeric' : undefined}
            onChange={(event) =>
              setNewValue(
                newType === 'naics'
                  ? event.target.value.replace(/\D/g, '').slice(0, 6)
                  : event.target.value
              )
            }
            placeholder={newType === 'naics' ? 'NAICS code' : t('collections.itemUrl')}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          disabled={
            disabled ||
            !newTitle.trim() ||
            !newValue.trim() ||
            (newType === 'naics' && newValue.trim().length < 2)
          }
          onClick={addItem}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('collections.addItem')}
        </Button>
      </div>

      <div className="space-y-0.5">
        <Label htmlFor="collection-paste-urls">{t('collections.pasteUrls')}</Label>
        <Textarea
          id="collection-paste-urls"
          value={pasteInput}
          disabled={disabled}
          onChange={(event) => setPasteInput(event.target.value)}
          placeholder={t('collections.urlsPlaceholder')}
          rows={4}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          disabled={disabled || !pasteInput.trim()}
          onClick={pasteUrls}
        >
          {t('collections.pasteUrlsConfirm')}
        </Button>
      </div>
    </div>
  )
}

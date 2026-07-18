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
import {
  collectionItemFromString,
  collectionItemsFromBulkInput,
} from '@/lib/utils/collection-entries'

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
  const [newValue, setNewValue] = useState('')

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
    const value = newValue.trim()
    if (!value) return
    const existingIds = new Set(items.map((item) => item.item_id))
    if (items.some((item) => item.title.trim() === value)) {
      setNewValue('')
      return
    }
    onChange([
      ...items,
      collectionItemFromString(value, items.length, existingIds),
    ])
    setNewValue('')
  }

  const pasteEntries = () => {
    const added = collectionItemsFromBulkInput(pasteInput, items)
    if (added.length === 0) return
    onChange(
      [...items, ...added].map((item, index) => ({ ...item, sort_order: index }))
    )
    setPasteInput('')
  }

  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-md border">
        {items.length === 0 ? (
          <p className="px-1.5 py-2 text-sm text-muted-foreground">{t('collections.noItems')}</p>
        ) : (
          <div className="divide-y">
            {items.map((item, index) => (
              <div
                key={`${item.item_id}-${index}`}
                className="grid gap-1 px-1.5 py-1.5 md:grid-cols-[auto_1fr_auto]"
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
                <Input
                  value={item.title}
                  disabled={disabled}
                  onChange={(e) => {
                    const title = e.target.value
                    const isUrl = /^https?:\/\//i.test(title.trim())
                    updateItem(index, {
                      title,
                      url: isUrl ? title.trim() : item.type === 'url' ? item.url : null,
                    })
                  }}
                  placeholder={t('collections.itemTitle')}
                />
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
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1 rounded-md border p-1.5">
        <p className="text-sm font-medium">{t('collections.addItem')}</p>
        <Input
          value={newValue}
          disabled={disabled}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={t('collections.itemTitle')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addItem()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          disabled={disabled || !newValue.trim()}
          onClick={addItem}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('collections.addItem')}
        </Button>
      </div>

      <div className="space-y-0.5">
        <Label htmlFor="collection-paste-entries">{t('collections.pasteUrls')}</Label>
        <Textarea
          id="collection-paste-entries"
          value={pasteInput}
          disabled={disabled}
          onChange={(e) => setPasteInput(e.target.value)}
          placeholder={t('collections.urlsPlaceholder')}
          rows={4}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          disabled={disabled || !pasteInput.trim()}
          onClick={pasteEntries}
        >
          {t('collections.pasteUrlsConfirm')}
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Library } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResourcePicker } from '@/components/common/ResourcePicker'
import { useCollectionsCatalog } from '@/lib/hooks/use-collections'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface CollectionPickerProps {
  selectedCollectionIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function CollectionPicker({
  selectedCollectionIds,
  onChange,
  disabled = false,
}: CollectionPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: catalog, isLoading } = useCollectionsCatalog({ enabled: open })

  const activeCollections = (catalog ?? []).filter(
    (collection) => !collection.archived && collection.status !== 'archived'
  )

  const selectedCount = selectedCollectionIds.length

  return (
    <ResourcePicker
      selectionMode="multi"
      value={selectedCollectionIds}
      onChange={onChange}
      onOpenChange={setOpen}
      title={t('collections.pickerTitle')}
      items={activeCollections}
      getItemId={(collection) => collection.id}
      getItemProps={(collection) => ({
        title: collection.name,
        description: collection.description,
        meta: t('collections.itemCount').replace(
          '{count}',
          collection.item_count.toString()
        ),
      })}
      isLoading={isLoading}
      emptyTitle={t('collections.pickerEmpty')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      formatSelectedCount={(count) =>
        t('collections.pickerSelected').replace('{count}', count.toString())
      }
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          disabled={disabled}
          aria-label={t('collections.pickerLabel')}
          title={
            selectedCount > 0
              ? t('collections.pickerSelected').replace('{count}', selectedCount.toString())
              : t('collections.pickerLabel')
          }
        >
          <Library className={cn('h-4 w-4', selectedCount > 0 && 'text-primary')} />
        </Button>
      }
    />
  )
}

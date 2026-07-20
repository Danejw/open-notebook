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
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}

export function CollectionPicker({
  selectedCollectionIds,
  onChange,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: CollectionPickerProps) {
  const { t } = useTranslation()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const handleOpenChange = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

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
      open={controlledOpen}
      onOpenChange={handleOpenChange}
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
        showTrigger ? (
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
        ) : undefined
      }
    />
  )
}

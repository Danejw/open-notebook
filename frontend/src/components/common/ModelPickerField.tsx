'use client'

import { useMemo, type ReactNode } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ResourcePicker } from '@/components/common/ResourcePicker'
import { useModels } from '@/lib/hooks/use-models'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { Model } from '@/lib/types/models'

export type ModelPickerFieldType = Model['type']

export interface ModelPickerFieldProps {
  id?: string
  label?: string
  labelClassName?: string
  modelType: ModelPickerFieldType
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  allowClear?: boolean
  models?: Model[]
  isLoading?: boolean
  sortByName?: boolean
  className?: string
  description?: ReactNode
  size?: 'default' | 'compact'
  title?: string
}

/**
 * Single-select model picker using the shared ResourcePicker checkbox-row UX.
 */
export function ModelPickerField({
  id,
  label,
  labelClassName,
  modelType,
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  invalid = false,
  allowClear = true,
  models: modelsProp,
  isLoading: isLoadingProp,
  sortByName = true,
  className,
  description,
  size = 'default',
  title,
}: ModelPickerFieldProps) {
  const { t } = useTranslation()
  const modelsQuery = useModels()
  const models = modelsProp ?? modelsQuery.data ?? []
  const isLoading = isLoadingProp ?? modelsQuery.isLoading

  const filtered = useMemo(() => {
    const list = models.filter((model) => model.type === modelType)
    if (sortByName) {
      return [...list].sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [models, modelType, sortByName])

  const selected = filtered.find((model) => model.id === value)
  const triggerLabel =
    selected?.name ??
    placeholder ??
    t('models.selectModelPlaceholder')

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label
          htmlFor={id}
          className={cn(
            labelClassName,
            required && "after:ml-0.5 after:text-destructive after:content-['*']",
            invalid && 'text-destructive'
          )}
        >
          {label}
        </Label>
      ) : null}

      <ResourcePicker
        selectionMode="single"
        value={value}
        onChange={onChange}
        title={title ?? label ?? t('models.selectModelPlaceholder')}
        items={filtered}
        getItemId={(model) => model.id}
        getItemProps={(model) => ({
          title: model.name,
          description: model.provider,
        })}
        isLoading={isLoading}
        emptyTitle={t('common.noResults')}
        cancelLabel={t('common.cancel')}
        saveLabel={t('common.save')}
        clearLabel={t('common.clearSelection')}
        showClear={allowClear}
        trigger={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={cn(
              'w-full justify-between font-normal',
              size === 'compact' ? 'h-8 text-xs' : 'h-9 text-sm',
              !selected && 'text-muted-foreground',
              invalid && 'border-destructive'
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        }
      />

      {description ? (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

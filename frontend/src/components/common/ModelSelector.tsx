import { ReactNode, useId, useMemo } from 'react'
import { X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useModels } from '@/lib/hooks/use-models'
import { SelectMenuSkeleton } from '@/components/common/LoadingSkeletons'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { Model } from '@/lib/types/models'

export type ModelType = Model['type']

export interface ModelDefaultOption {
  value?: string
  label: ReactNode
  provider?: string
}

function ModelItemContent({ name, provider }: { name: ReactNode; provider?: string }) {
  return (
    <div className="flex items-center justify-between w-full">
      <span>{name}</span>
      {provider ? (
        <span className="text-xs text-muted-foreground ml-2">{provider}</span>
      ) : null}
    </div>
  )
}

export interface ModelSelectItemsProps {
  models: Model[]
  isLoading?: boolean
  sortByName?: boolean
  defaultOption?: ModelDefaultOption
  skeletonRows?: number
}

export function ModelSelectItems({
  models,
  isLoading = false,
  sortByName = false,
  defaultOption,
  skeletonRows = 3,
}: ModelSelectItemsProps) {
  const { t } = useTranslation()

  const sortedModels = useMemo(() => {
    const list = [...models]
    if (sortByName) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [models, sortByName])

  if (isLoading) {
    return <SelectMenuSkeleton rows={skeletonRows} />
  }

  return (
    <>
      {defaultOption ? (
        <SelectItem value={defaultOption.value ?? 'default'}>
          <ModelItemContent name={defaultOption.label} provider={defaultOption.provider} />
        </SelectItem>
      ) : null}
      {sortedModels.length === 0 && !defaultOption ? (
        <div className="text-sm text-muted-foreground py-2 px-2">
          {t('common.noResults')}
        </div>
      ) : (
        sortedModels.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <ModelItemContent name={model.name} provider={model.provider} />
          </SelectItem>
        ))
      )}
    </>
  )
}

export interface ModelSelectorProps {
  id?: string
  name?: string
  label?: string
  labelClassName?: string
  modelType: ModelType
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  size?: 'default' | 'compact'
  required?: boolean
  invalid?: boolean
  allowClear?: boolean
  onClear?: () => void
  defaultOption?: ModelDefaultOption
  models?: Model[]
  isLoading?: boolean
  sortByName?: boolean
  className?: string
  description?: ReactNode
  skeletonRows?: number
}

export function ModelSelector({
  id,
  name,
  label,
  labelClassName,
  modelType,
  value,
  onChange,
  placeholder,
  disabled = false,
  size = 'default',
  required = false,
  invalid = false,
  allowClear = false,
  onClear,
  defaultOption,
  models: modelsProp,
  isLoading: isLoadingProp,
  sortByName = false,
  className,
  description,
  skeletonRows = 3,
}: ModelSelectorProps) {
  const { t } = useTranslation()
  const { data: fetchedModels, isLoading: fetchedLoading } = useModels({
    enabled: modelsProp === undefined,
  })
  const derivedId = useId()
  const selectId = id || derivedId

  const isLoading = isLoadingProp ?? fetchedLoading
  const filteredModels = useMemo(() => {
    const allModels = modelsProp ?? fetchedModels ?? []
    return allModels.filter((model) => model.type === modelType)
  }, [modelsProp, fetchedModels, modelType])

  const resolvedInvalid =
    invalid ||
    (required &&
      filteredModels.length > 0 &&
      (!value || !filteredModels.some((model) => model.id === value)))

  const resolvedPlaceholder =
    placeholder ??
    (required && resolvedInvalid
      ? t('models.requiredModelPlaceholder')
      : t('settings.embeddingOptionPlaceholder'))

  const handleClear = () => {
    if (onClear) {
      onClear()
      return
    }
    onChange('')
  }

  const selectControl = (
    <Select
      name={name}
      value={value}
      onValueChange={onChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger
        id={selectId}
        className={cn(
          size === 'compact' && 'h-8 text-xs',
          resolvedInvalid && 'border-destructive',
        )}
      >
        <SelectValue placeholder={resolvedPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        <ModelSelectItems
          models={filteredModels}
          isLoading={isLoading}
          sortByName={sortByName}
          defaultOption={defaultOption}
          skeletonRows={skeletonRows}
        />
      </SelectContent>
    </Select>
  )

  return (
    <div className={cn('space-y-2', size === 'compact' && 'space-y-1', className)}>
      {label ? (
        <Label htmlFor={selectId} className={labelClassName}>
          {label}
          {required ? <span className="text-destructive ml-0.5">*</span> : null}
        </Label>
      ) : null}
      {allowClear ? (
        <div className="flex gap-1">
          <div className="min-w-0 flex-1">{selectControl}</div>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              aria-label={t('common.clearSelection')}
              className={cn('shrink-0', size === 'compact' ? 'h-8 w-8' : 'h-7 w-7')}
            >
              <X className={size === 'compact' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            </Button>
          ) : null}
        </div>
      ) : (
        selectControl
      )}
      {description ? (
        <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
      ) : null}
    </div>
  )
}

'use client'

import { useForm, Controller, Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SettingsFormSkeleton } from '@/components/common/LoadingSkeletons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings'
import { useEffect, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

const settingsSchema = z.object({
  default_content_processing_engine_doc: z.enum(['auto', 'docling', 'simple']).optional(),
  default_content_processing_engine_url: z.enum(['auto', 'firecrawl', 'jina', 'simple']).optional(),
  default_embedding_option: z.enum(['ask', 'always', 'never']).optional(),
  auto_delete_files: z.enum(['yes', 'no']).optional(),
})

type SettingsFormData = z.infer<typeof settingsSchema>

interface SelectOption {
  value: string
  label: string
}

interface SettingSelectFieldProps {
  name: string
  labelId: string
  label: string
  fieldName: keyof SettingsFormData
  options: SelectOption[]
  helpText: string
  placeholder: string
  control: Control<SettingsFormData>
  isLoading: boolean
  expanded: boolean
  onToggleExpand: () => void
}

function SettingSelectField({
  labelId,
  label,
  fieldName,
  options,
  helpText,
  placeholder,
  control,
  isLoading,
  expanded,
  onToggleExpand,
}: SettingSelectFieldProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <Label htmlFor={labelId}>{label}</Label>
      <Controller
        name={fieldName}
        control={control}
        render={({ field }) => (
          <Select
            key={field.value}
            name={field.name}
            value={field.value || ''}
            onValueChange={field.onChange}
            disabled={field.disabled || isLoading}
          >
            <SelectTrigger id={labelId} className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Collapsible open={expanded} onOpenChange={onToggleExpand}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {t('settings.helpMeChoose')}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 text-sm text-muted-foreground space-y-2">
          <p>{helpText}</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export function SettingsForm() {
  const { t } = useTranslation()
  const { data: settings, isLoading, error } = useSettings()
  const updateSettings = useUpdateSettings()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    doc: false,
    url: false,
    embedding: false,
    files: false
  })
  const [hasResetForm, setHasResetForm] = useState(false)
  
  
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      default_content_processing_engine_doc: undefined,
      default_content_processing_engine_url: undefined,
      default_embedding_option: undefined,
      auto_delete_files: undefined,
    }
  })


  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  useEffect(() => {
    if (settings && settings.default_content_processing_engine_doc && !hasResetForm) {
      const formData = {
        default_content_processing_engine_doc: settings.default_content_processing_engine_doc as 'auto' | 'docling' | 'simple',
        default_content_processing_engine_url: settings.default_content_processing_engine_url as 'auto' | 'firecrawl' | 'jina' | 'simple',
        default_embedding_option: settings.default_embedding_option as 'ask' | 'always' | 'never',
        auto_delete_files: settings.auto_delete_files as 'yes' | 'no',
      }
      reset(formData)
      setHasResetForm(true)
    }
  }, [hasResetForm, reset, settings])

  const onSubmit = async (data: SettingsFormData) => {
    await updateSettings.mutateAsync(data)
  }

  if (isLoading) {
    return <SettingsFormSkeleton />
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('settings.loadFailed')}</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : t('common.error')}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.contentProcessing')}</CardTitle>
          <CardDescription>
            {t('settings.contentProcessingDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSelectField
            name="doc"
            labelId="doc_engine"
            label={t('settings.docEngine')}
            fieldName="default_content_processing_engine_doc"
            options={[
              { value: 'auto', label: t('settings.autoRecommended') },
              { value: 'docling', label: t('settings.docling') },
              { value: 'simple', label: t('settings.simple') },
            ]}
            helpText={t('settings.docHelp')}
            placeholder={t('settings.docEnginePlaceholder')}
            control={control}
            isLoading={isLoading}
            expanded={expandedSections.doc}
            onToggleExpand={() => toggleSection('doc')}
          />
          <SettingSelectField
            name="url"
            labelId="url_engine"
            label={t('settings.urlEngine')}
            fieldName="default_content_processing_engine_url"
            options={[
              { value: 'auto', label: t('settings.autoRecommended') },
              { value: 'firecrawl', label: t('settings.firecrawl') },
              { value: 'jina', label: t('settings.jina') },
              { value: 'simple', label: t('settings.simple') },
            ]}
            helpText={t('settings.urlHelp')}
            placeholder={t('settings.urlEnginePlaceholder')}
            control={control}
            isLoading={isLoading}
            expanded={expandedSections.url}
            onToggleExpand={() => toggleSection('url')}
          />
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>{t('settings.embeddingAndSearch')}</CardTitle>
          <CardDescription>
            {t('settings.embeddingAndSearchDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSelectField
            name="embedding"
            labelId="embedding"
            label={t('settings.defaultEmbeddingOption')}
            fieldName="default_embedding_option"
            options={[
              { value: 'ask', label: t('settings.ask') },
              { value: 'always', label: t('settings.always') },
              { value: 'never', label: t('settings.never') },
            ]}
            helpText={t('settings.embeddingHelp')}
            placeholder={t('settings.embeddingOptionPlaceholder')}
            control={control}
            isLoading={isLoading}
            expanded={expandedSections.embedding}
            onToggleExpand={() => toggleSection('embedding')}
          />
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>{t('settings.fileManagement')}</CardTitle>
          <CardDescription>
            {t('settings.fileManagementDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSelectField
            name="files"
            labelId="auto_delete"
            label={t('settings.autoDeleteFiles')}
            fieldName="auto_delete_files"
            options={[
              { value: 'yes', label: t('common.yes') },
              { value: 'no', label: t('common.no') },
            ]}
            helpText={t('settings.filesHelp')}
            placeholder={t('settings.autoDeletePlaceholder')}
            control={control}
            isLoading={isLoading}
            expanded={expandedSections.files}
            onToggleExpand={() => toggleSection('files')}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
         <Button 
          type="submit" 
          disabled={!isDirty || updateSettings.isPending}
        >
          {updateSettings.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}

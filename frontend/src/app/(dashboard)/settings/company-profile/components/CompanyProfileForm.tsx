'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SettingsFormSkeleton } from '@/components/common/LoadingSkeletons'
import { PageError } from '@/components/common/PageError'
import { AutoFillFromFile } from '@/components/common/AutoFillFromFile'
import {
  useOpportunityScoringProfile,
  useUpdateOpportunityScoringProfile,
} from '@/lib/hooks/use-opportunities'
import { useTranslation } from '@/lib/hooks/use-translation'

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatList(values: string[] | undefined): string {
  return (values ?? []).join(', ')
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/** JSON Schema sent to the shared autofill endpoint (agnostic of form wire format). */
export const COMPANY_PROFILE_AUTOFILL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    licenses: { type: 'array', items: { type: 'string' } },
    preferred_trades: { type: 'array', items: { type: 'string' } },
    supported_islands: { type: 'array', items: { type: 'string' } },
    min_project_value: { type: 'number' },
    max_project_value: { type: ['number', 'null'] },
    minimum_bid_days: { type: 'integer' },
    max_bond_percent: { type: 'number' },
    preferred_keywords: { type: 'array', items: { type: 'string' } },
    excluded_keywords: { type: 'array', items: { type: 'string' } },
  },
  required: ['name'],
}

const companyProfileSchema = z.object({
  name: z.string().min(1),
  licenses: z.string(),
  preferred_trades: z.string(),
  supported_islands: z.string(),
  min_project_value: z.number().min(0),
  max_project_value: z.string(),
  minimum_bid_days: z.number().int().min(0),
  max_bond_percent: z.number().min(0),
  preferred_keywords: z.string(),
  excluded_keywords: z.string(),
})

type CompanyProfileFormData = z.infer<typeof companyProfileSchema>

export function CompanyProfileForm() {
  const { t } = useTranslation()
  const { data: profile, isLoading, error } = useOpportunityScoringProfile()
  const updateProfile = useUpdateOpportunityScoringProfile()

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { isDirty, errors },
  } = useForm<CompanyProfileFormData>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      name: '',
      licenses: '',
      preferred_trades: '',
      supported_islands: '',
      min_project_value: 0,
      max_project_value: '',
      minimum_bid_days: 14,
      max_bond_percent: 10,
      preferred_keywords: '',
      excluded_keywords: '',
    },
  })

  useEffect(() => {
    if (!profile) return
    reset({
      name: profile.name,
      licenses: formatList(profile.licenses),
      preferred_trades: formatList(profile.preferred_trades),
      supported_islands: formatList(profile.supported_islands),
      min_project_value: profile.min_project_value,
      max_project_value:
        profile.max_project_value === null || profile.max_project_value === undefined
          ? ''
          : String(profile.max_project_value),
      minimum_bid_days: profile.minimum_bid_days,
      max_bond_percent: profile.max_bond_percent,
      preferred_keywords: formatList(profile.preferred_keywords),
      excluded_keywords: formatList(profile.excluded_keywords),
    })
  }, [profile, reset])

  if (isLoading) {
    return <SettingsFormSkeleton />
  }

  if (error) {
    return (
      <PageError
        title={t('companyProfile.saveErrorTitle')}
        description={error instanceof Error ? error.message : t('common.error')}
      />
    )
  }

  const missingReadyFields: string[] = []
  if (profile && !profile.profile_ready) {
    if (!profile.licenses.length) missingReadyFields.push(t('companyProfile.licenses'))
    if (!profile.preferred_trades.length) missingReadyFields.push(t('companyProfile.preferredTrades'))
    if (!profile.supported_islands.length) {
      missingReadyFields.push(t('companyProfile.supportedIslands'))
    }
    if (profile.max_project_value === null || profile.max_project_value === undefined) {
      missingReadyFields.push(t('companyProfile.maxProjectValue'))
    }
  }

  const applyAutofill = (data: Record<string, unknown>) => {
    const current = getValues()
    const maxValue = data.max_project_value
    const next: CompanyProfileFormData = {
      name:
        typeof data.name === 'string' && data.name.trim()
          ? data.name.trim()
          : current.name,
      licenses:
        data.licenses !== undefined ? formatList(asStringList(data.licenses)) : current.licenses,
      preferred_trades:
        data.preferred_trades !== undefined
          ? formatList(asStringList(data.preferred_trades))
          : current.preferred_trades,
      supported_islands:
        data.supported_islands !== undefined
          ? formatList(asStringList(data.supported_islands))
          : current.supported_islands,
      min_project_value:
        data.min_project_value !== undefined
          ? asNumber(data.min_project_value, current.min_project_value)
          : current.min_project_value,
      max_project_value:
        maxValue === null
          ? ''
          : maxValue !== undefined
            ? String(asNumber(maxValue, 0))
            : current.max_project_value,
      minimum_bid_days:
        data.minimum_bid_days !== undefined
          ? asNumber(data.minimum_bid_days, current.minimum_bid_days)
          : current.minimum_bid_days,
      max_bond_percent:
        data.max_bond_percent !== undefined
          ? asNumber(data.max_bond_percent, current.max_bond_percent)
          : current.max_bond_percent,
      preferred_keywords:
        data.preferred_keywords !== undefined
          ? formatList(asStringList(data.preferred_keywords))
          : current.preferred_keywords,
      excluded_keywords:
        data.excluded_keywords !== undefined
          ? formatList(asStringList(data.excluded_keywords))
          : current.excluded_keywords,
    }

    ;(Object.keys(next) as Array<keyof CompanyProfileFormData>).forEach((key) => {
      setValue(key, next[key], { shouldDirty: true, shouldValidate: true })
    })
  }

  const onSubmit = handleSubmit((data) => {
    const maxRaw = data.max_project_value.trim()
    updateProfile.mutate({
      name: data.name.trim(),
      licenses: parseList(data.licenses),
      preferred_trades: parseList(data.preferred_trades),
      supported_islands: parseList(data.supported_islands),
      min_project_value: data.min_project_value,
      max_project_value: maxRaw === '' ? null : Number(maxRaw),
      minimum_bid_days: data.minimum_bid_days,
      max_bond_percent: data.max_bond_percent,
      preferred_keywords: parseList(data.preferred_keywords),
      excluded_keywords: parseList(data.excluded_keywords),
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {profile && !profile.profile_ready ? (
        <Alert>
          <AlertTitle>{t('companyProfile.notReadyTitle')}</AlertTitle>
          <AlertDescription>
            {t('companyProfile.notReadyDescription')}
            {missingReadyFields.length > 0 ? (
              <span className="mt-2 block">
                {t('companyProfile.missingFields')}: {missingReadyFields.join(', ')}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {profile ? (
          <p className="text-sm text-muted-foreground">
            {t('companyProfile.sourceLabel')}: {t(`companyProfile.source.${profile.source}`)}
          </p>
        ) : (
          <span />
        )}
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <AutoFillFromFile
            schema={COMPANY_PROFILE_AUTOFILL_SCHEMA}
            instructions={t('companyProfile.autofillInstructions')}
            onFilled={applyAutofill}
            multiple
          />
          <p className="text-xs text-muted-foreground">{t('companyProfile.fillHint')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyProfile.identityTitle')}</CardTitle>
          <CardDescription>{t('companyProfile.identityDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">{t('companyProfile.name')}</Label>
            <Input id="company-name" {...register('name')} />
            {errors.name ? (
              <p className="text-sm text-destructive">{t('companyProfile.requiredField')}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyProfile.capacityTitle')}</CardTitle>
          <CardDescription>{t('companyProfile.capacityDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="min-value">{t('companyProfile.minProjectValue')}</Label>
            <Input
              id="min-value"
              type="number"
              min={0}
              step="1"
              {...register('min_project_value', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-value">{t('companyProfile.maxProjectValue')}</Label>
            <Input
              id="max-value"
              type="number"
              min={0}
              step="1"
              placeholder={t('companyProfile.maxProjectValuePlaceholder')}
              {...register('max_project_value')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bid-days">{t('companyProfile.minimumBidDays')}</Label>
            <Input
              id="bid-days"
              type="number"
              min={0}
              step="1"
              {...register('minimum_bid_days', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bond-percent">{t('companyProfile.maxBondPercent')}</Label>
            <Input
              id="bond-percent"
              type="number"
              min={0}
              step="0.1"
              {...register('max_bond_percent', { valueAsNumber: true })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('companyProfile.matchingTitle')}</CardTitle>
          <CardDescription>{t('companyProfile.matchingDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="licenses">{t('companyProfile.licenses')}</Label>
            <Textarea
              id="licenses"
              rows={2}
              placeholder={t('companyProfile.listPlaceholder')}
              {...register('licenses')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trades">{t('companyProfile.preferredTrades')}</Label>
            <Textarea
              id="trades"
              rows={2}
              placeholder={t('companyProfile.listPlaceholder')}
              {...register('preferred_trades')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="islands">{t('companyProfile.supportedIslands')}</Label>
            <Textarea
              id="islands"
              rows={2}
              placeholder={t('companyProfile.islandsPlaceholder')}
              {...register('supported_islands')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred-keywords">{t('companyProfile.preferredKeywords')}</Label>
            <Textarea
              id="preferred-keywords"
              rows={2}
              placeholder={t('companyProfile.listPlaceholder')}
              {...register('preferred_keywords')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="excluded-keywords">{t('companyProfile.excludedKeywords')}</Label>
            <Textarea
              id="excluded-keywords"
              rows={2}
              placeholder={t('companyProfile.listPlaceholder')}
              {...register('excluded_keywords')}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || updateProfile.isPending}>
          {updateProfile.isPending ? t('common.saving') : t('companyProfile.saveAndRescore')}
        </Button>
      </div>
    </form>
  )
}

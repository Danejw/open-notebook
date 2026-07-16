'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { McpAuthType } from '@/lib/types/mcp'

export interface McpAuthFieldsProps {
  authType: McpAuthType
  onAuthTypeChange: (value: McpAuthType) => void
  bearerToken: string
  onBearerTokenChange: (value: string) => void
  /** Override for the bearer token field label (e.g. replace-auth "new token"). */
  tokenLabel?: string
  /** Optional helper text under the bearer token input. */
  tokenHint?: string
  tokenAutoComplete?: string
  className?: string
}

/** Shared MCP auth-type select + conditional bearer token input. */
export function McpAuthFields({
  authType,
  onAuthTypeChange,
  bearerToken,
  onBearerTokenChange,
  tokenLabel,
  tokenHint,
  tokenAutoComplete = 'off',
  className,
}: McpAuthFieldsProps) {
  const { t } = useTranslation()
  const authTypeId = useId()
  const tokenId = useId()

  return (
    <div className={className ?? 'space-y-3'}>
      <div className="space-y-1.5">
        <Label htmlFor={authTypeId}>{t('tools.authType')}</Label>
        <Select
          value={authType}
          onValueChange={(value: McpAuthType) => onAuthTypeChange(value)}
        >
          <SelectTrigger id={authTypeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('tools.authNone')}</SelectItem>
            <SelectItem value="bearer">{t('tools.authBearer')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {authType === 'bearer' ? (
        <div className="space-y-1.5">
          <Label htmlFor={tokenId}>{tokenLabel ?? t('tools.bearerToken')}</Label>
          <Input
            id={tokenId}
            type="password"
            value={bearerToken}
            onChange={(e) => onBearerTokenChange(e.target.value)}
            placeholder={t('tools.bearerTokenPlaceholder')}
            autoComplete={tokenAutoComplete}
          />
          {tokenHint ? (
            <p className="text-xs text-muted-foreground">{tokenHint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

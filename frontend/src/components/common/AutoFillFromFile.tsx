'use client'

import { useRef } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSchemaAutofill } from '@/lib/hooks/use-schema-autofill'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface AutoFillFromFileProps {
  schema: Record<string, unknown>
  onFilled: (data: Record<string, unknown>) => void
  instructions?: string
  accept?: string
  multiple?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Reusable control: pick file(s) → LLM fills values matching `schema` → `onFilled`.
 */
export function AutoFillFromFile({
  schema,
  onFilled,
  instructions,
  accept,
  multiple = false,
  disabled = false,
  className,
}: AutoFillFromFileProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const autofill = useSchemaAutofill()

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files
    if (!selected || selected.length === 0) return
    const files = Array.from(selected)
    // Allow re-selecting the same file later
    event.target.value = ''

    try {
      const result = await autofill.mutateAsync({
        files,
        schema,
        instructions,
      })
      onFilled(result.data)
    } catch {
      // Toast handled in the mutation hook
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        disabled={disabled || autofill.isPending}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || autofill.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {autofill.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileUp className="mr-2 h-4 w-4" />
        )}
        {autofill.isPending ? t('autofill.filling') : t('autofill.fillFromFile')}
      </Button>
    </div>
  )
}

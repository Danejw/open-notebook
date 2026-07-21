'use client'

import type { FormEventHandler, ReactNode } from 'react'

import { FormDialogShell, type FormDialogShellProps } from '@/components/common/FormDialogShell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type RenameFieldDialogShellPassthrough = Pick<
  FormDialogShellProps,
  | 'description'
  | 'onOpen'
  | 'submitLabel'
  | 'submittingLabel'
  | 'footerLeft'
  | 'formClassName'
  | 'footerClassName'
>

export interface RenameFieldDialogProps extends RenameFieldDialogShellPassthrough {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  isSubmitting?: boolean
  /** Optional second field (textarea). */
  descriptionLabel?: string
  descriptionValue?: string
  onDescriptionChange?: (value: string) => void
  inputId?: string
  placeholder?: string
  compactFooter?: boolean
  contentClassName?: string
  fieldClassName?: string
  /** Extra form content after the field(s), e.g. a preview block. */
  children?: ReactNode
}

export function RenameFieldDialog({
  open,
  onOpenChange,
  title,
  label,
  value,
  onChange,
  onSubmit,
  isSubmitting = false,
  descriptionLabel,
  descriptionValue = '',
  onDescriptionChange,
  inputId = 'rename-field-input',
  placeholder,
  compactFooter = false,
  contentClassName,
  fieldClassName,
  children,
  description,
  onOpen,
  submitLabel,
  submittingLabel,
  footerLeft,
  formClassName,
  footerClassName,
}: RenameFieldDialogProps) {
  const hasDescriptionField =
    descriptionLabel !== undefined && onDescriptionChange !== undefined

  const disableSubmit =
    !value.trim() || (hasDescriptionField && !descriptionValue.trim())

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
      onOpen={onOpen}
      disableSubmit={disableSubmit}
      submitLabel={submitLabel}
      submittingLabel={submittingLabel}
      compactFooter={compactFooter}
      contentClassName={contentClassName}
      formClassName={formClassName}
      footerClassName={footerClassName}
      footerLeft={footerLeft}
    >
      <div className={cn('space-y-1.5', fieldClassName)}>
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      </div>

      {hasDescriptionField ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${inputId}-description`}>{descriptionLabel}</Label>
          <Textarea
            id={`${inputId}-description`}
            value={descriptionValue}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </div>
      ) : null}

      {children}
    </FormDialogShell>
  )
}

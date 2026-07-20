'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export const pickerDialogContentClassName =
  'max-h-[70vh] max-w-md gap-0 overflow-hidden p-0 sm:max-w-md'

export const pickerDialogHeaderClassName = 'border-b'

export const pickerDialogBodyClassName = 'max-h-64 overflow-y-auto hide-scrollbar'

export const pickerDialogFooterClassName = 'flex-row items-center border-t sm:justify-between'

interface PickerDialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional trigger; omit for externally controlled dialogs (e.g. column actions). */
  trigger?: ReactNode
  title: ReactNode
  footerLeft?: ReactNode
  actions: ReactNode
  /** Content rendered above the scrollable body (e.g. search). */
  beforeBody?: ReactNode
  afterBody?: ReactNode
  contentClassName?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
  children: ReactNode
}

export function PickerDialogShell({
  open,
  onOpenChange,
  trigger,
  title,
  footerLeft,
  actions,
  beforeBody,
  afterBody,
  contentClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
  children,
}: PickerDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={cn(pickerDialogContentClassName, contentClassName)}>
        <DialogHeader className={cn(pickerDialogHeaderClassName, headerClassName)}>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {beforeBody}

        <div className={cn(pickerDialogBodyClassName, bodyClassName)}>{children}</div>

        {afterBody}

        <DialogFooter className={cn(pickerDialogFooterClassName, footerClassName)}>
          {footerLeft}
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface PickerDialogActionsProps {
  cancelLabel: string
  saveLabel: string
  onCancel: () => void
  onSave: () => void
  cancelDisabled?: boolean
  saveDisabled?: boolean
}

export function PickerDialogActions({
  cancelLabel,
  saveLabel,
  onCancel,
  onSave,
  cancelDisabled = false,
  saveDisabled = false,
}: PickerDialogActionsProps) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onCancel}
        disabled={cancelDisabled}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onSave}
        disabled={saveDisabled}
      >
        {saveLabel}
      </Button>
    </div>
  )
}

export function usePickerDialogDraft<T>(
  selected: T,
  controlled?: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [draft, setDraft] = useState(selected)
  const isControlled = controlled?.open !== undefined
  const open = isControlled ? Boolean(controlled.open) : uncontrolledOpen

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setDraft(selected)
      }
      if (!isControlled) {
        setUncontrolledOpen(nextOpen)
      }
      controlled?.onOpenChange?.(nextOpen)
    },
    [controlled, isControlled, selected]
  )

  const close = useCallback(() => {
    handleOpenChange(false)
  }, [handleOpenChange])

  return {
    open,
    draft,
    setDraft,
    handleOpenChange,
    close,
  }
}

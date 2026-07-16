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
  trigger: ReactNode
  title: ReactNode
  footerLeft?: ReactNode
  actions: ReactNode
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
  afterBody,
  contentClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
  children,
}: PickerDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn(pickerDialogContentClassName, contentClassName)}>
        <DialogHeader className={cn(pickerDialogHeaderClassName, headerClassName)}>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

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
}

export function PickerDialogActions({
  cancelLabel,
  saveLabel,
  onCancel,
  onSave,
}: PickerDialogActionsProps) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
      <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={onSave}>
        {saveLabel}
      </Button>
    </div>
  )
}

export function usePickerDialogDraft<T>(selected: T) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(selected)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setDraft(selected)
      }
      setOpen(nextOpen)
    },
    [selected]
  )

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  return {
    open,
    draft,
    setDraft,
    handleOpenChange,
    close,
  }
}

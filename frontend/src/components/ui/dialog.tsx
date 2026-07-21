"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useTranslation } from "@/lib/hooks/use-translation"

import { cn } from "@/lib/utils"
import {
  clearBodyPointerLock,
  scheduleClearBodyPointerLock,
} from "@/lib/utils/clear-body-pointer-lock"

/**
 * Shared compact dialog shell.
 * Top padding is owned by the header band so the absolute close button
 * shares the same vertical origin as DialogHeader (avoids title/X overlap).
 */
export const dialogContentClassName =
  "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:pointer-events-none fixed top-[50%] left-[50%] z-50 flex w-full max-w-lg max-h-[85vh] h-auto translate-x-[-50%] translate-y-[-50%] flex-col gap-0.5 overflow-hidden rounded-lg border px-1 pb-1 pt-0 shadow-lg duration-200"

/** Large editor / workspace dialogs that need the old 70vh shell */
export const dialogLargeContentClassName =
  "h-[70vh] max-h-[70vh] w-[70vw] max-w-[70vw]"

/**
 * Header band — min-h-9 matches the size-7 close control + top-1 inset
 * so title and close share one vertically centered row.
 */
export const dialogHeaderClassName =
  "flex min-h-9 flex-shrink-0 flex-col justify-center gap-0.5 px-1 py-1 text-left"

/** Title — same weight/size as PageHeader h1 */
export const dialogTitleClassName =
  "text-base font-semibold leading-snug"

export const dialogDescriptionClassName =
  "text-[11px] leading-snug text-muted-foreground"

export const dialogFooterClassName =
  "flex flex-shrink-0 flex-col-reverse gap-1 px-1 py-0.5 sm:flex-row sm:justify-end"

export const dialogBodyClassName =
  "min-h-0 flex-1 overflow-y-auto px-1 py-1"

/** Close control: size-7 at right-1/top-1, centered in the min-h-9 header band */
export const dialogCloseButtonClassName =
  "absolute right-1 top-1 z-10 flex size-7 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"

function Dialog({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      {...props}
      onOpenChange={(open) => {
        onOpenChange?.(open)
        // Radix may restore a stale pointer-events:none from nested layers.
        if (!open) scheduleClearBodyPointerLock()
      }}
    />
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
}

const DialogContent = ({
  className,
  children,
  showCloseButton = true,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) => {
  const { t } = useTranslation()

  // Clear any leftover DropdownMenu lock before DismissableLayer snapshots
  // originalBodyPointerEvents (layout effect runs before layer useEffect).
  React.useLayoutEffect(() => {
    clearBodyPointerLock()
  }, [])

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        aria-describedby={undefined}
        className={cn(dialogContentClassName, className)}
        {...props}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          scheduleClearBodyPointerLock()
        }}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className={dialogCloseButtonClassName}>
            <X className="h-4 w-4" />
            <span className="sr-only">{t('common.close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(dialogHeaderClassName, "pr-9", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(dialogFooterClassName, className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogTitleClassName, className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(dialogDescriptionClassName, className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

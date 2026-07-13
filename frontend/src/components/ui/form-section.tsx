"use client"

import { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface FormSectionProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
  htmlFor?: string
  /**
   * Compact rhythm is the default. Pass `dense={false}` only when a surface
   * explicitly needs looser spacing.
   */
  dense?: boolean
}

export function FormSection({
  title,
  description,
  children,
  className,
  htmlFor,
  dense = true,
}: FormSectionProps) {
  return (
    <div className={cn(dense ? "mb-0.5 last:mb-0" : "mb-6 last:mb-0", className)}>
      <div className={cn(dense ? "mb-0.5" : "mb-4")}>
        {htmlFor ? (
          <Label htmlFor={htmlFor} className={cn("font-medium block", dense ? "text-sm mb-0.5" : "text-base mb-1")}>
            {title}
          </Label>
        ) : (
          <h3 className={cn("font-medium block", dense ? "text-sm mb-0.5" : "text-base mb-1")}>
            {title}
          </h3>
        )}
        {description && (
          <p className={cn("text-muted-foreground", dense ? "text-[11px]" : "text-sm")}>
            {description}
          </p>
        )}
      </div>
      <div className={cn(dense ? "space-y-0.5" : "space-y-3")}>
        {children}
      </div>
    </div>
  )
}

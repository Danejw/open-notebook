"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface WizardStep {
  number: number
  title: string
  description?: string
}

interface WizardContainerProps {
  children: ReactNode
  currentStep: number
  steps: readonly WizardStep[]
  onStepClick?: (step: number) => void
  /** When false, hides the step indicator chrome (footer nav can still change steps). */
  showSteps?: boolean
  className?: string
}

function StepIndicator({ currentStep, steps, onStepClick }: {
  currentStep: number
  steps: readonly WizardStep[]
  onStepClick?: (step: number) => void
}) {
  return (
    <div className="flex items-center justify-between px-0.5 py-0.5 border-b border-border bg-muted">
      {steps.map((step, index) => {
        const isCompleted = currentStep > step.number
        const isCurrent = currentStep === step.number
        const isClickable = step.number <= currentStep && onStepClick
        
        return (
          <div key={step.number} className="flex items-center flex-1 min-w-0">
            <div 
              className={cn('flex items-center min-w-0', isClickable && 'cursor-pointer')}
              onClick={isClickable ? () => onStepClick(step.number) : undefined}
            >
              <div
                className={cn(
                  'flex items-center justify-center size-7 shrink-0 rounded-full border text-[11px] font-medium transition-colors',
                  isCompleted 
                    ? 'bg-primary border-primary text-primary-foreground' 
                    : isCurrent 
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-border text-muted-foreground bg-card'
                )}
              >
                {isCompleted ? "✓" : step.number}
              </div>
              <div className="ml-0.5 min-w-0">
                <p className={cn(
                  'text-[11px] font-medium truncate',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {step.title}
                </p>
                {step.description ? (
                  <p className={cn(
                    'text-[11px] truncate',
                    isCurrent ? 'text-muted-foreground' : 'text-muted-foreground/80'
                  )}>
                    {step.description}
                  </p>
                ) : null}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div 
                className={cn(
                  'flex-1 border-t mx-0.5 transition-colors',
                  isCompleted ? 'border-primary' : 'border-border/60'
                )} 
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function WizardContainer({
  children,
  currentStep,
  steps,
  onStepClick,
  showSteps = true,
  className
}: WizardContainerProps) {
  return (
    <div
      className={cn(
        'flex flex-col min-w-0 overflow-hidden bg-card rounded-lg border border-border',
        showSteps ? 'h-[500px]' : 'max-h-[min(420px,70vh)]',
        className
      )}
    >
      {showSteps ? (
        <StepIndicator
          currentStep={currentStep}
          steps={steps}
          onStepClick={onStepClick}
        />
      ) : null}

      <div
        className={cn(
          'min-w-0 overflow-y-auto',
          showSteps ? 'flex-1 overflow-hidden p-0.5' : 'p-0.5'
        )}
      >
        {showSteps ? (
          <div className="h-full min-w-0 overflow-y-auto">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

export type { WizardStep }

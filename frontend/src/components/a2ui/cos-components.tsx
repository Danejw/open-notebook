'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { z } from 'zod/v3'
import type { ComponentContext } from '@a2ui/web_core/v0_9'
import {
  createBinderlessComponentImplementation,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Loose schema avoids Zod×CommonSchemas type explosion under tsc. */
const loosePropsSchema = z.record(z.string(), z.any())

function defineCosComponent(
  name: string,
  Render: (args: {
    context: ComponentContext
    buildChild: (id: string, basePath?: string) => ReactNode
  }) => ReactNode
): ReactComponentImplementation {
  // Cast through unknown — A2UI binder generics explode under tsc with our Zod version.
  return (
    createBinderlessComponentImplementation as unknown as (
      api: { name: string; schema: typeof loosePropsSchema },
      render: typeof Render
    ) => ReactComponentImplementation
  )({ name, schema: loosePropsSchema }, Render)
}

function resolveString(
  context: ComponentContext,
  value: unknown,
  fallback = ''
): string {
  if (value == null) {
    return fallback
  }
  try {
    const resolved = context.dataContext.resolveDynamicValue(value as never)
    if (typeof resolved === 'string') {
      return resolved
    }
    if (resolved == null) {
      return fallback
    }
    return String(resolved)
  } catch {
    return typeof value === 'string' ? value : fallback
  }
}

function resolveValue(context: ComponentContext, value: unknown): unknown {
  if (value == null) {
    return value
  }
  try {
    return context.dataContext.resolveDynamicValue(value as never)
  } catch {
    return value
  }
}

function useDynamicTick(context: ComponentContext, value: unknown): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (value == null) {
      return
    }
    try {
      const sub = context.dataContext.subscribeDynamicValue(value as never, () => {
        setTick((current) => current + 1)
      })
      return () => sub.unsubscribe()
    } catch {
      return
    }
  }, [context, value])
  return tick
}

type AskOption = {
  id: string
  label: string
  recommended: boolean
}

function asAskOptions(value: unknown): AskOption[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => ({
      id:
        typeof item.id === 'string' && item.id
          ? item.id
          : `option-${index}`,
      label:
        typeof item.label === 'string'
          ? item.label
          : typeof item.title === 'string'
            ? item.title
            : `Option ${index + 1}`,
      recommended: Boolean(item.recommended),
    }))
}

function setPathValue(
  context: ComponentContext,
  binding: unknown,
  next: string
): void {
  if (
    binding &&
    typeof binding === 'object' &&
    'path' in (binding as object) &&
    typeof (binding as { path: unknown }).path === 'string'
  ) {
    context.dataContext.set((binding as { path: string }).path, next)
  }
}

/**
 * Clarifying question with suggested answers (recommended first)
 * plus optional free-text when none fit.
 */
export const AskUser = defineCosComponent('AskUser', ({ context }) => {
  const [submitting, setSubmitting] = useState(false)
  const props = context.componentModel.properties as Record<string, unknown>
  useDynamicTick(context, props.question)
  useDynamicTick(context, props.options)
  useDynamicTick(context, props.customValue)
  useDynamicTick(context, props.selectedOptionId)

  const question = resolveString(context, props.question, 'Choose an option')
  const options = asAskOptions(resolveValue(context, props.options))
  const customValue = resolveString(context, props.customValue)
  const selectedOptionId = resolveString(context, props.selectedOptionId)
  const customPlaceholder = resolveString(
    context,
    props.customPlaceholder,
    'Or type your own answer…'
  )
  const submitLabel = resolveString(context, props.submitLabel, 'Submit answer')

  const sorted = [
    ...options.filter((option) => option.recommended),
    ...options.filter((option) => !option.recommended),
  ]

  const submit = async (payload: {
    optionId: string
    optionLabel: string
    customText: string
  }) => {
    if (submitting) {
      return
    }
    const answer = payload.customText.trim() || payload.optionLabel.trim()
    if (!answer) {
      return
    }
    setSubmitting(true)
    try {
      setPathValue(context, props.selectedOptionId, payload.optionId)
      setPathValue(context, props.customValue, payload.customText)
      await context.dispatchAction({
        event: {
          name: 'ask_user_answer',
          context: {
            question,
            optionId: payload.optionId,
            optionLabel: payload.optionLabel,
            customText: payload.customText.trim(),
            answer,
          },
        },
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{question}</p>
      <div className="flex flex-col gap-1.5">
        {sorted.map((option) => {
          const selected = selectedOptionId === option.id && !customValue.trim()
          return (
            <button
              key={option.id}
              type="button"
              disabled={submitting}
              onClick={() =>
                void submit({
                  optionId: option.id,
                  optionLabel: option.label,
                  customText: '',
                })
              }
              className={cn(
                'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                'disabled:pointer-events-none disabled:opacity-50',
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background'
              )}
            >
              <span className="flex-1">{option.label}</span>
              {option.recommended ? (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recommended
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="space-y-1.5 pt-1">
        <Label className="text-xs">Something else</Label>
        <div className="flex gap-2">
          <Input
            value={customValue}
            disabled={submitting}
            onChange={(event) => {
              setPathValue(context, props.selectedOptionId, '')
              setPathValue(context, props.customValue, event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit({
                  optionId: '',
                  optionLabel: '',
                  customText: customValue,
                })
              }
            }}
            placeholder={customPlaceholder}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0"
            disabled={submitting || !customValue.trim()}
            onClick={() =>
              void submit({
                optionId: '',
                optionLabel: '',
                customText: customValue,
              })
            }
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
})

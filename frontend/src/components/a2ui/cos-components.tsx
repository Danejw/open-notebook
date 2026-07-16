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

type SourceChip = {
  id?: string
  title?: string
  kind?: string
}

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

function asSourceList(value: unknown): SourceChip[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      title: typeof item.title === 'string' ? item.title : 'Untitled',
      kind: typeof item.kind === 'string' ? item.kind : 'source',
    }))
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

export const SourceChipList = defineCosComponent(
  'SourceChipList',
  ({ context }) => {
    const [expanded, setExpanded] = useState(false)
    const props = context.componentModel.properties as Record<string, unknown>
    useDynamicTick(context, props.sources)
    useDynamicTick(context, props.title)

    const title = resolveString(context, props.title)
    const sources = asSourceList(resolveValue(context, props.sources))
    const visible = expanded ? sources : sources.slice(0, 4)
    const hiddenCount = Math.max(0, sources.length - visible.length)

    return (
      <div className="space-y-2">
        {title ? (
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {visible.map((source, index) => (
            <span
              key={source.id ?? `${source.title}-${index}`}
              className={cn(
                'inline-flex max-w-full items-center rounded-md border bg-background px-2 py-0.5',
                'text-xs text-foreground'
              )}
              title={source.id}
            >
              <span className="truncate">{source.title}</span>
              {source.kind ? (
                <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                  {source.kind}
                </span>
              ) : null}
            </span>
          ))}
        </div>
        {sources.length > 4 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Show less' : `Show ${hiddenCount} more`}
          </Button>
        ) : null}
      </div>
    )
  }
)

export const MissingFieldForm = defineCosComponent(
  'MissingFieldForm',
  ({ context }) => {
    const props = context.componentModel.properties as Record<string, unknown>
    useDynamicTick(context, props.value)
    useDynamicTick(context, props.label)

    const label = resolveString(context, props.label, 'Field')
    const hint = resolveString(context, props.hint)
    const value = resolveString(context, props.value)

    const onChange = (next: string) => {
      const binding = props.value
      if (
        binding &&
        typeof binding === 'object' &&
        'path' in (binding as object) &&
        typeof (binding as { path: unknown }).path === 'string'
      ) {
        context.dataContext.set((binding as { path: string }).path, next)
      }
    }

    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={hint || undefined}
          className="h-8 text-sm"
        />
        {hint ? (
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    )
  }
)

export const ConfirmActions = defineCosComponent(
  'ConfirmActions',
  ({ context }) => {
    const props = context.componentModel.properties as Record<string, unknown>
    const confirmLabel = resolveString(context, props.confirmLabel, 'Confirm context')
    const refineLabel = resolveString(context, props.refineLabel, 'Refine')

    const runAction = async (action: unknown) => {
      if (!action) {
        return
      }
      await context.dispatchAction(action)
    }

    return (
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-8"
          onClick={() => void runAction(props.onConfirm)}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => void runAction(props.onRefine)}
        >
          {refineLabel}
        </Button>
      </div>
    )
  }
)

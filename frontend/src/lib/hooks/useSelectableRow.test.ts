import { renderHook, act } from '@testing-library/react'
import { type KeyboardEvent, type MutableRefObject, type PointerEvent } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { useSelectableRow, selectableRowClassName } from '@/lib/hooks/useSelectableRow'

describe('selectableRowClassName', () => {
  it('returns undefined when not selected', () => {
    expect(selectableRowClassName(false)).toBeUndefined()
  })

  it('returns full selected classes by default', () => {
    expect(selectableRowClassName(true)).toBe('bg-primary/10 ring-1 ring-primary/40')
  })

  it('returns ring-only classes when ringOnly is true', () => {
    expect(selectableRowClassName(true, { ringOnly: true })).toBe('ring-1 ring-primary/40')
  })
})

describe('useSelectableRow', () => {
  it('exposes aria-pressed only in selection mode', () => {
    const { result, rerender } = renderHook(
      (props: { selectionMode: boolean; selected: boolean }) =>
        useSelectableRow({
          selectionMode: props.selectionMode,
          selected: props.selected,
          onToggleSelect: vi.fn(),
        }),
      { initialProps: { selectionMode: false, selected: true } },
    )

    expect(result.current.rowProps['aria-pressed']).toBeUndefined()

    rerender({ selectionMode: true, selected: true })
    expect(result.current.rowProps['aria-pressed']).toBe(true)

    rerender({ selectionMode: true, selected: false })
    expect(result.current.rowProps['aria-pressed']).toBe(false)
  })

  it('toggles selection on activate when in selection mode', () => {
    const onToggleSelect = vi.fn()
    const { result } = renderHook(() =>
      useSelectableRow({
        selectionMode: true,
        selected: false,
        onToggleSelect,
      }),
    )

    act(() => {
      result.current.handleActivate()
    })

    expect(onToggleSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onActivate when not in selection mode', () => {
    const onActivate = vi.fn()
    const { result } = renderHook(() =>
      useSelectableRow({
        selectionMode: false,
        selected: false,
        onToggleSelect: vi.fn(),
        onActivate,
      }),
    )

    act(() => {
      result.current.handleActivate()
    })

    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('suppresses activation when suppressClickRef is set', () => {
    const onActivate = vi.fn()
    const suppressClickRef = { current: true } as MutableRefObject<boolean>
    const { result } = renderHook(() =>
      useSelectableRow({
        selectionMode: false,
        selected: false,
        onToggleSelect: vi.fn(),
        onActivate,
        suppressClickRef,
      }),
    )

    act(() => {
      result.current.handleActivate()
    })

    expect(onActivate).not.toHaveBeenCalled()
  })

  it('handles Enter and Space keyboard activation', () => {
    const onActivate = vi.fn()
    const { result } = renderHook(() =>
      useSelectableRow({
        selectionMode: false,
        selected: false,
        onToggleSelect: vi.fn(),
        onActivate,
      }),
    )

    const preventDefault = vi.fn()

    act(() => {
      result.current.rowProps.onKeyDown({
        key: 'Enter',
        preventDefault,
      } as unknown as KeyboardEvent<HTMLElement>)
    })
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.rowProps.onKeyDown({
        key: ' ',
        preventDefault,
      } as unknown as KeyboardEvent<HTMLElement>)
    })
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('enters selection on long press when not in selection mode', () => {
    vi.useFakeTimers()
    const onEnterSelection = vi.fn()
    const { result } = renderHook(() =>
      useSelectableRow({
        selectionMode: false,
        selected: false,
        onToggleSelect: vi.fn(),
        onEnterSelection,
      }),
    )

    act(() => {
      result.current.rowProps.onPointerDown({
        pointerType: 'mouse',
        button: 0,
        clientX: 0,
        clientY: 0,
      } as unknown as PointerEvent<HTMLElement>)
    })

    act(() => {
      vi.advanceTimersByTime(450)
    })

    expect(onEnterSelection).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('returns selectedClassName based on selectedRingOnly', () => {
    const { result, rerender } = renderHook(
      (props: { selected: boolean; selectedRingOnly: boolean }) =>
        useSelectableRow({
          selectionMode: true,
          selected: props.selected,
          selectedRingOnly: props.selectedRingOnly,
          onToggleSelect: vi.fn(),
        }),
      { initialProps: { selected: true, selectedRingOnly: false } },
    )

    expect(result.current.selectedClassName).toBe('bg-primary/10 ring-1 ring-primary/40')

    rerender({ selected: true, selectedRingOnly: true })
    expect(result.current.selectedClassName).toBe('ring-1 ring-primary/40')

    rerender({ selected: false, selectedRingOnly: false })
    expect(result.current.selectedClassName).toBeUndefined()
  })

  it('provides button row semantics', () => {
    const { result } = renderHook(() =>
      useSelectableRow({
        selectionMode: false,
        selected: false,
        onToggleSelect: vi.fn(),
      }),
    )

    expect(result.current.rowProps.role).toBe('button')
    expect(result.current.rowProps.tabIndex).toBe(0)
    expect(typeof result.current.rowProps.onClick).toBe('function')
    expect(typeof result.current.rowProps.onPointerDown).toBe('function')
  })
})

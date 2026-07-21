import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useListSelection } from './useListSelection'

describe('useListSelection', () => {
  it('starts with no selection and selectionMode false', () => {
    const { result } = renderHook(() => useListSelection())

    expect(result.current.selectionMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.selectedList).toEqual([])
  })

  it('enterSelection selects a single id and enables selectionMode', () => {
    const { result } = renderHook(() => useListSelection())

    act(() => {
      result.current.enterSelection('a')
    })

    expect(result.current.selectionMode).toBe(true)
    expect(result.current.selectedList).toEqual(['a'])
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.isSelected('b')).toBe(false)
  })

  it('toggleSelect adds and removes ids', () => {
    const { result } = renderHook(() => useListSelection())

    act(() => {
      result.current.toggleSelect('a')
    })
    expect(result.current.selectedList).toEqual(['a'])

    act(() => {
      result.current.toggleSelect('b')
    })
    expect(result.current.selectedList).toEqual(expect.arrayContaining(['a', 'b']))
    expect(result.current.selectedList).toHaveLength(2)

    act(() => {
      result.current.toggleSelect('a')
    })
    expect(result.current.selectedList).toEqual(['b'])
    expect(result.current.isSelected('a')).toBe(false)
  })

  it('selectAllVisible replaces selection with the given ids', () => {
    const { result } = renderHook(() => useListSelection())

    act(() => {
      result.current.enterSelection('old')
    })

    act(() => {
      result.current.selectAllVisible(['x', 'y', 'z'])
    })

    expect(result.current.selectedList).toEqual(expect.arrayContaining(['x', 'y', 'z']))
    expect(result.current.selectedList).toHaveLength(3)
    expect(result.current.isSelected('old')).toBe(false)
  })

  it('clearSelection resets selection state', () => {
    const { result } = renderHook(() => useListSelection())

    act(() => {
      result.current.selectAllVisible(['a', 'b'])
    })

    act(() => {
      result.current.clearSelection()
    })

    expect(result.current.selectionMode).toBe(false)
    expect(result.current.selectedList).toEqual([])
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('enterSelection replaces an existing multi-selection', () => {
    const { result } = renderHook(() => useListSelection())

    act(() => {
      result.current.selectAllVisible(['a', 'b', 'c'])
    })

    act(() => {
      result.current.enterSelection('b')
    })

    expect(result.current.selectedList).toEqual(['b'])
  })

  describe('explicit mode', () => {
    it('starts with no selection and selectionMode false', () => {
      const { result } = renderHook(() => useListSelection({ mode: 'explicit' }))

      expect(result.current.selectionMode).toBe(false)
      expect(result.current.selectedIds.size).toBe(0)
      expect(result.current.selectedList).toEqual([])
    })

    it('enterSelection without id enables selectionMode with zero selected', () => {
      const { result } = renderHook(() => useListSelection({ mode: 'explicit' }))

      act(() => {
        result.current.enterSelection()
      })

      expect(result.current.selectionMode).toBe(true)
      expect(result.current.selectedList).toEqual([])
    })

    it('enterSelection with id enables selectionMode and selects the id', () => {
      const { result } = renderHook(() => useListSelection({ mode: 'explicit' }))

      act(() => {
        result.current.enterSelection('a')
      })

      expect(result.current.selectionMode).toBe(true)
      expect(result.current.selectedList).toEqual(['a'])
    })

    it('clearSelection clears ids but keeps selectionMode', () => {
      const { result } = renderHook(() => useListSelection({ mode: 'explicit' }))

      act(() => {
        result.current.enterSelection()
        result.current.selectAllVisible(['a', 'b'])
      })

      act(() => {
        result.current.clearSelection()
      })

      expect(result.current.selectionMode).toBe(true)
      expect(result.current.selectedList).toEqual([])
    })

    it('exitSelection clears ids and exits selectionMode', () => {
      const { result } = renderHook(() => useListSelection({ mode: 'explicit' }))

      act(() => {
        result.current.enterSelection()
        result.current.selectAllVisible(['a', 'b'])
      })

      act(() => {
        result.current.exitSelection()
      })

      expect(result.current.selectionMode).toBe(false)
      expect(result.current.selectedList).toEqual([])
      expect(result.current.selectedIds.size).toBe(0)
    })

    it('toggleSelect and selectAllVisible work in explicit mode', () => {
      const { result } = renderHook(() => useListSelection({ mode: 'explicit' }))

      act(() => {
        result.current.enterSelection()
        result.current.toggleSelect('a')
      })

      expect(result.current.selectionMode).toBe(true)
      expect(result.current.selectedList).toEqual(['a'])

      act(() => {
        result.current.selectAllVisible(['x', 'y'])
      })

      expect(result.current.selectedList).toEqual(expect.arrayContaining(['x', 'y']))
      expect(result.current.selectedList).toHaveLength(2)
    })
  })
})

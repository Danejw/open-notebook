'use client'

import { useState, useMemo, useCallback } from 'react'

export type UseListSelectionMode = 'implicit' | 'explicit'

export type UseListSelectionOptions =
  | { mode?: 'implicit' }
  | { mode: 'explicit' }

type ListSelectionCore = {
  selectedIds: Set<string>
  selectionMode: boolean
  selectedList: string[]
  clearSelection: () => void
  toggleSelect: (id: string) => void
  selectAllVisible: (ids: string[]) => void
  isSelected: (id: string) => boolean
}

export type ImplicitListSelection = ListSelectionCore & {
  enterSelection: (id: string) => void
}

export type ExplicitListSelection = ListSelectionCore & {
  enterSelection: (id?: string) => void
  exitSelection: () => void
}

export function useListSelection(): ImplicitListSelection
export function useListSelection(options: { mode?: 'implicit' }): ImplicitListSelection
export function useListSelection(options: { mode: 'explicit' }): ExplicitListSelection
export function useListSelection(
  options?: UseListSelectionOptions
): ImplicitListSelection | ExplicitListSelection {
  const mode: UseListSelectionMode = options?.mode ?? 'implicit'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [explicitSelectionMode, setExplicitSelectionMode] = useState(false)

  const selectionMode =
    mode === 'explicit' ? explicitSelectionMode : selectedIds.size > 0
  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const exitSelection = useCallback(() => {
    setSelectedIds(new Set())
    setExplicitSelectionMode(false)
  }, [])

  const enterSelectionImplicit = useCallback((id: string) => {
    setSelectedIds(new Set([id]))
  }, [])

  const enterSelectionExplicit = useCallback((id?: string) => {
    setExplicitSelectionMode(true)
    if (id !== undefined) {
      setSelectedIds(new Set([id]))
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllVisible = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  )

  const core: ListSelectionCore = {
    selectedIds,
    selectionMode,
    selectedList,
    clearSelection,
    toggleSelect,
    selectAllVisible,
    isSelected,
  }

  if (mode === 'explicit') {
    return {
      ...core,
      enterSelection: enterSelectionExplicit,
      exitSelection,
    }
  }

  return {
    ...core,
    enterSelection: enterSelectionImplicit,
  }
}

'use client'

import { useState, useMemo, useCallback } from 'react'

export function useListSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const selectionMode = selectedIds.size > 0
  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const enterSelection = useCallback((id: string) => {
    setSelectedIds(new Set([id]))
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

  return {
    selectedIds,
    selectionMode,
    selectedList,
    clearSelection,
    enterSelection,
    toggleSelect,
    selectAllVisible,
    isSelected,
  }
}

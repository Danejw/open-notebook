import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ChatUiState {
  /** When true, suggestion pills stay hidden and the LLM suggestions call is skipped. */
  suggestionsCollapsed: boolean
  setSuggestionsCollapsed: (collapsed: boolean) => void
}

export const useChatUiStore = create<ChatUiState>()(
  persist(
    (set) => ({
      suggestionsCollapsed: false,
      setSuggestionsCollapsed: (collapsed) =>
        set({ suggestionsCollapsed: collapsed }),
    }),
    {
      name: 'chat-ui-storage',
      partialize: (state) => ({
        suggestionsCollapsed: state.suggestionsCollapsed,
      }),
    }
  )
)

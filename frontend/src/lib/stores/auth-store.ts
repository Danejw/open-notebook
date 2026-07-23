import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isAxiosError } from 'axios'
import { apiClient } from '@/lib/api/client'
import { getConfig } from '@/lib/config'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  isLoading: boolean
  error: string | null
  lastAuthCheck: number | null
  isCheckingAuth: boolean
  hasHydrated: boolean
  authRequired: boolean | null
  setHasHydrated: (state: boolean) => void
  checkAuthRequired: () => Promise<boolean>
  login: (password: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<boolean>
}

/**
 * Probe /projects with an explicit Bearer token.
 * validateStatus avoids the axios 401 interceptor redirect during auth checks.
 */
async function probeAuth(token: string): Promise<{ ok: boolean; status?: number }> {
  try {
    const response = await apiClient.get('/projects', {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    })
    return { ok: response.status >= 200 && response.status < 300, status: response.status }
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      return { ok: false, status: error.response.status }
    }
    throw error
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      isLoading: false,
      error: null,
      lastAuthCheck: null,
      isCheckingAuth: false,
      hasHydrated: false,
      authRequired: null,

      setHasHydrated: (state: boolean) => {
        set({ hasHydrated: state })
      },

      checkAuthRequired: async () => {
        try {
          // Reuse cached /api/config from ConnectionGuard — avoids extra /api/auth/status round-trip
          const appConfig = await getConfig()
          const required = appConfig.authEnabled ?? false
          set({ authRequired: required })

          if (!required) {
            set({ isAuthenticated: true, token: 'not-required' })
          }

          return required
        } catch (error) {
          console.error('Failed to check auth status:', error)

          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            set({
              error: 'Unable to connect to server. Please check if the API is running.',
              authRequired: null,
            })
          } else {
            set({ authRequired: true })
          }

          throw error
        }
      },

      login: async (password: string) => {
        set({ isLoading: true, error: null })
        try {
          const { ok, status } = await probeAuth(password)

          if (ok) {
            set({
              isAuthenticated: true,
              token: password,
              isLoading: false,
              lastAuthCheck: Date.now(),
              error: null,
            })
            return true
          }

          let errorMessage = 'Authentication failed'
          if (status === 401) {
            errorMessage = 'Invalid password. Please try again.'
          } else if (status === 403) {
            errorMessage = 'Access denied. Please check your credentials.'
          } else if (status !== undefined && status >= 500) {
            errorMessage = 'Server error. Please try again later.'
          } else if (status !== undefined) {
            errorMessage = `Authentication failed (${status})`
          }

          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null,
          })
          return false
        } catch (error) {
          console.error('Network error during auth:', error)
          let errorMessage = 'Authentication failed'

          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to server. Please check if the API is running.'
          } else if (isAxiosError(error) && !error.response) {
            errorMessage = 'Unable to connect to server. Please check if the API is running.'
          } else if (error instanceof Error) {
            errorMessage = `Network error: ${error.message}`
          } else {
            errorMessage = 'An unexpected error occurred during authentication'
          }

          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null,
          })
          return false
        }
      },

      logout: () => {
        set({
          isAuthenticated: false,
          token: null,
          error: null,
        })
      },

      checkAuth: async () => {
        const state = get()
        const { token, lastAuthCheck, isCheckingAuth, isAuthenticated } = state

        // If already checking, return current auth state
        if (isCheckingAuth) {
          return isAuthenticated
        }

        // If no token, not authenticated
        if (!token) {
          return false
        }

        // If we checked recently (within 30 seconds) and are authenticated, skip
        const now = Date.now()
        if (isAuthenticated && lastAuthCheck && (now - lastAuthCheck) < 30000) {
          return true
        }

        set({ isCheckingAuth: true })

        try {
          const { ok } = await probeAuth(token)

          if (ok) {
            set({
              isAuthenticated: true,
              lastAuthCheck: now,
              isCheckingAuth: false,
            })
            return true
          }

          set({
            isAuthenticated: false,
            token: null,
            lastAuthCheck: null,
            isCheckingAuth: false,
          })
          return false
        } catch (error) {
          console.error('checkAuth error:', error)
          set({
            isAuthenticated: false,
            token: null,
            lastAuthCheck: null,
            isCheckingAuth: false,
          })
          return false
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      }
    }
  )
)

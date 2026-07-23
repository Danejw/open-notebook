import axios, { AxiosResponse } from 'axios'
import { getApiUrl } from '@/lib/config'

// API client with runtime-configurable base URL
// The base URL is fetched from the API config endpoint on first request
//
// Request timeout defaults to 10 minutes (600000ms) to accommodate slow LLM
// operations (artifacts, synchronous chat) on slower hardware
// (Ollama, LM Studio). Configure it via NEXT_PUBLIC_API_TIMEOUT_MS for models
// that can take longer than 10 minutes to respond (#880).
// Note: value is in milliseconds; an explicit 0 disables the timeout entirely.
// An empty or invalid value falls back to the default (so a present-but-empty
// env var doesn't accidentally disable timeouts).
const DEFAULT_API_TIMEOUT_MS = 600000 // 600 seconds = 10 minutes
const rawTimeout = process.env.NEXT_PUBLIC_API_TIMEOUT_MS
const parsedTimeout = rawTimeout && rawTimeout.trim() !== '' ? Number(rawTimeout) : NaN
const apiTimeout = Number.isFinite(parsedTimeout) && parsedTimeout >= 0
  ? parsedTimeout
  : DEFAULT_API_TIMEOUT_MS

const AUTH_STORAGE_KEY = 'auth-storage'

/**
 * Read the Bearer token from Zustand-persisted auth storage (browser only).
 * Used by SSE fetch callers that bypass the Axios interceptor.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const authStorage = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!authStorage) {
    return null
  }
  try {
    const { state } = JSON.parse(authStorage) as { state?: { token?: unknown } }
    return typeof state?.token === 'string' ? state.token : null
  } catch (error) {
    console.error('Error parsing auth storage:', error)
    return null
  }
}

export const apiClient = axios.create({
  timeout: apiTimeout,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
})

/**
 * Clears rejected credentials and redirects the browser to sign in.
 */
export function handleUnauthorizedResponse(): void {
  if (typeof window === 'undefined') {
    return
  }
  localStorage.removeItem(AUTH_STORAGE_KEY)
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

// Request interceptor to add base URL and auth header
apiClient.interceptors.request.use(async (config) => {
  // Set the base URL dynamically from runtime config
  if (!config.baseURL) {
    const apiUrl = await getApiUrl()
    config.baseURL = `${apiUrl}/api`
  }

  const token = getAuthToken()
  // Preserve explicit Authorization (e.g. login probe with candidate password).
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Handle FormData vs JSON content types
  if (config.data instanceof FormData) {
    // Remove any Content-Type header to let browser set multipart boundary
    delete config.headers['Content-Type']
  } else if (config.method && ['post', 'put', 'patch'].includes(config.method.toLowerCase())) {
    config.headers['Content-Type'] = 'application/json'
  }

  return config
})

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    if (error.response?.status === 401) {
      handleUnauthorizedResponse()
    }
    return Promise.reject(error)
  }
)

export default apiClient
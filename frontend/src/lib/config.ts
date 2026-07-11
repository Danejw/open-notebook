/**
 * Runtime configuration for the frontend.
 * This allows the same Docker image to work in different environments.
 */

import { AppConfig, BackendConfigResponse } from '@/lib/types/config'

// Build timestamp for debugging - set at build time
const BUILD_TIME = new Date().toISOString()

let config: AppConfig | null = null
let configPromise: Promise<AppConfig> | null = null

/**
 * Get the API URL to use for requests.
 *
 * Priority:
 * 1. Runtime config from API server (/api/config endpoint)
 * 2. Environment variable (NEXT_PUBLIC_API_URL)
 * 3. Default fallback (http://localhost:5055)
 */
export async function getApiUrl(): Promise<string> {
  // If we already have config, return it
  if (config) {
    return config.apiUrl
  }

  // If we're already fetching, wait for that
  if (configPromise) {
    const cfg = await configPromise
    return cfg.apiUrl
  }

  // Start fetching config
  configPromise = fetchConfig()
  const cfg = await configPromise
  return cfg.apiUrl
}

/**
 * Get the full configuration.
 */
export async function getConfig(): Promise<AppConfig> {
  if (config) {
    return config
  }

  if (configPromise) {
    return await configPromise
  }

  configPromise = fetchConfig()
  return await configPromise
}

/**
 * Fetch configuration from the API or use defaults.
 */
async function fetchConfig(): Promise<AppConfig> {
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    console.log('🔧 [Config] Starting configuration detection...')
    console.log('🔧 [Config] Build time:', BUILD_TIME)
  }

  const envApiUrl = process.env.NEXT_PUBLIC_API_URL
  const defaultApiUrl = ''

  if (isDev) {
    console.log('🔧 [Config] NEXT_PUBLIC_API_URL from build:', envApiUrl || '(not set)')
  }

  // Parallel: runtime /config and backend /api/config (using env/default base URL)
  const initialBase = envApiUrl || defaultApiUrl

  const runtimeConfigPromise = (async (): Promise<string | null> => {
    try {
      if (isDev) console.log('🔧 [Config] Fetching runtime config from /config...')
      const runtimeResponse = await fetch('/config', { cache: 'no-store' })
      if (runtimeResponse.ok) {
        const runtimeData = await runtimeResponse.json()
        const url = runtimeData.apiUrl
        if (url === '') return null
        if (isDev) console.log('✅ [Config] Runtime API URL from server:', url)
        return url as string
      }
      if (isDev) console.log('⚠️ [Config] Runtime config endpoint returned status:', runtimeResponse.status)
    } catch (error) {
      if (isDev) console.log('⚠️ [Config] Could not fetch runtime config:', error)
    }
    return null
  })()

  const backendConfigPromise = (async (): Promise<BackendConfigResponse | null> => {
    try {
      if (isDev) console.log('🔧 [Config] Fetching backend config from:', `${initialBase}/api/config`)
      const response = await fetch(`${initialBase}/api/config`, { cache: 'no-store' })
      if (response.ok) {
        return (await response.json()) as BackendConfigResponse
      }
    } catch {
      // Retry with resolved base URL after runtime config if needed
    }
    return null
  })()

  const [runtimeApiUrl, backendDataInitial] = await Promise.all([
    runtimeConfigPromise,
    backendConfigPromise,
  ])

  const baseUrl =
    runtimeApiUrl !== null && runtimeApiUrl !== undefined
      ? runtimeApiUrl
      : envApiUrl || defaultApiUrl

  if (isDev) {
    console.log('🔧 [Config] Final base URL:', baseUrl)
  }

  let data = backendDataInitial

  // If runtime base differs from initial, refetch backend config once
  if (!data && baseUrl !== initialBase) {
    try {
      const response = await fetch(`${baseUrl}/api/config`, { cache: 'no-store' })
      if (response.ok) {
        data = (await response.json()) as BackendConfigResponse
      } else {
        throw new Error(`API config endpoint returned status ${response.status}`)
      }
    } catch (error) {
      throw error
    }
  }

  if (!data) {
    try {
      const response = await fetch(`${baseUrl}/api/config`, { cache: 'no-store' })
      if (response.ok) {
        data = (await response.json()) as BackendConfigResponse
      } else {
        throw new Error(`API config endpoint returned status ${response.status}`)
      }
    } catch (error) {
      throw error
    }
  }

  config = {
    apiUrl: baseUrl,
    version: data.version || 'unknown',
    buildTime: BUILD_TIME,
    latestVersion: data.latestVersion || null,
    hasUpdate: data.hasUpdate || false,
    dbStatus: data.dbStatus,
    authEnabled: data.authEnabled ?? false,
  }
  if (isDev) console.log('✅ [Config] Successfully loaded API config:', config)
  return config
}

/**
 * Return cached config synchronously when already loaded (e.g. after ConnectionGuard).
 */
export function getCachedConfig(): AppConfig | null {
  return config
}

/**
 * Reset the configuration cache (useful for testing).
 */
export function resetConfig(): void {
  config = null
  configPromise = null
}

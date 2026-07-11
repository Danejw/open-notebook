'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { ConnectionError } from '@/lib/types/config'
import { ConnectionErrorOverlay } from '@/components/errors/ConnectionErrorOverlay'
import { AppShellSkeleton } from '@/components/layout/AppShellSkeleton'
import { getConfig, resetConfig } from '@/lib/config'

interface ConnectionGuardProps {
  children: React.ReactNode
}

export function ConnectionGuard({ children }: ConnectionGuardProps) {
  const [error, setError] = useState<ConnectionError | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  // Use a ref to track checking status to avoid dependency cycles
  const isCheckingRef = useRef(false)

  const checkConnection = useCallback(async (forceRefresh = false) => {
    // Prevent re-entry if already checking
    if (isCheckingRef.current) {
       return
    }
    
    isCheckingRef.current = true
    setIsChecking(true)
    
    setError(null)

    // Only bust cache on explicit retry — initial mount uses warm config when available
    if (forceRefresh) {
      resetConfig()
    }

    try {
      const config = await getConfig()

      // Check if database is offline
      if (config.dbStatus === 'offline') {
        const dbError: ConnectionError = {
          type: 'database-offline',
          details: {
            message: 'Database is offline', // Fallback message, UI will translate
            attemptedUrl: config.apiUrl,
          },
        }
        setError(dbError)
        isCheckingRef.current = false
        setIsChecking(false)
        return
      }

      // If we got here, connection is good
      setError(null)
      isCheckingRef.current = false
      setIsChecking(false)
    } catch (err) {
      // API is unreachable
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const attemptedUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/api/config`
          : undefined

      const apiError: ConnectionError = {
        type: 'api-unreachable',
        details: {
          message: 'Unable to connect to API', // Fallback message
          technicalMessage: errorMessage,
          stack: err instanceof Error ? err.stack : undefined,
          attemptedUrl,
        },
      }
      
      setError(apiError)
      isCheckingRef.current = false
      setIsChecking(false)
    }
  }, []) // Empty dependency array - stable callback

  // Check connection on mount
  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  // Add keyboard shortcut for retry (R key)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (error && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        checkConnection(true)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [error, checkConnection])

  // Show overlay if there's an error
  if (error) {
    return (
      <ConnectionErrorOverlay
        error={error}
        onRetry={() => checkConnection(true)}
      />
    )
  }

  // Show app shell skeleton while checking — never a blank screen
  if (isChecking) {
    return <AppShellSkeleton />
  }

  // Render children if connection is good
  return <>{children}</>
}

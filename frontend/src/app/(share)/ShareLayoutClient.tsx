'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useAuth } from '@/lib/hooks/use-auth'
import { Skeleton } from '@/components/ui/skeleton'

interface ShareLayoutClientProps {
  children: React.ReactNode
}

export function ShareLayoutClient({ children }: ShareLayoutClientProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setHasCheckedAuth(true)

      if (!isAuthenticated) {
        const currentPath = window.location.pathname + window.location.search
        sessionStorage.setItem('redirectAfterLogin', currentPath)
        router.push('/login')
      }
    }
  }, [isAuthenticated, isLoading, router])

  const awaitingAuth = isLoading || !hasCheckedAuth

  let mainContent: React.ReactNode = null
  if (awaitingAuth) {
    mainContent = (
      <div className="flex h-screen w-full items-center justify-center p-6">
        <Skeleton className="h-10 w-48" />
      </div>
    )
  } else if (isAuthenticated) {
    mainContent = children
  }

  return <ErrorBoundary>{mainContent}</ErrorBoundary>
}

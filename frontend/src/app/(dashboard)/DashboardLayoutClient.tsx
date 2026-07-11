'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardContentSkeleton } from '@/components/layout/DashboardContentSkeleton'
import { useAuth } from '@/lib/hooks/use-auth'
import { useVersionCheck } from '@/lib/hooks/use-version-check'
import { CreateDialogsProvider } from '@/lib/hooks/use-create-dialogs'

const ModalProvider = dynamic(
  () => import('@/components/providers/ModalProvider').then((m) => m.ModalProvider),
  { ssr: false }
)

const CommandPalette = dynamic(
  () => import('@/components/common/CommandPalette').then((m) => m.CommandPalette),
  { ssr: false }
)

interface DashboardLayoutClientProps {
  children: React.ReactNode
}

export function DashboardLayoutClient({ children }: DashboardLayoutClientProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false)

  useVersionCheck()

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
    mainContent = <DashboardContentSkeleton />
  } else if (isAuthenticated) {
    mainContent = children
  }

  return (
    <ErrorBoundary>
      <CreateDialogsProvider>
        <AppShell>{mainContent}</AppShell>
        {isAuthenticated && !awaitingAuth ? (
          <>
            <ModalProvider />
            <CommandPalette />
          </>
        ) : null}
      </CreateDialogsProvider>
    </ErrorBoundary>
  )
}

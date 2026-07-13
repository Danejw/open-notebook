'use client'

import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen gap-0.5 overflow-hidden bg-background p-0.5">
      <AppSidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
        <SetupBanner />
        {children}
      </main>
    </div>
  )
}

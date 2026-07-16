'use client'

import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    // Viewport-locked shell: h-dvh (not h-full) so height does not depend on
    // ancestor percentage chains. Nested panels scroll; the document does not.
    <div className="flex h-dvh max-h-dvh gap-0.5 overflow-hidden overscroll-none bg-background p-0.5">
      <AppSidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-none rounded-lg border border-border bg-background">
        <SetupBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
    </div>
  )
}

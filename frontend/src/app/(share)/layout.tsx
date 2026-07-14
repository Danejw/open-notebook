import { ShareLayoutClient } from '@/app/(share)/ShareLayoutClient'

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ShareLayoutClient>{children}</ShareLayoutClient>
}

import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'
import { RetryButton } from '@/components/echo/pwa'

export const metadata: Metadata = { title: 'Offline — Echo' }

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <div className="grid size-14 place-items-center rounded-full bg-surface-2 text-muted-foreground">
          <WifiOff size={24} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">Echo needs a connection to sync your diary and talk with you. Check your network and try again.</p>
        <RetryButton />
      </div>
    </main>
  )
}

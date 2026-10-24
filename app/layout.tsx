import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'

export const metadata: Metadata = { title: 'Echo — Your life, remembered.', description: 'A calm AI diary companion for your goals, memories, and daily life.' }
export const viewport = { themeColor: '#07101f', width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html> }

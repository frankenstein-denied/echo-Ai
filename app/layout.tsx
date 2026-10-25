import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = { title: 'Echo — Your life, remembered.', description: 'A calm AI diary companion for your goals, memories, and daily life.' }
export const viewport = { themeColor: '#0b0f14', width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={inter.variable}><body><AuthProvider>{children}</AuthProvider></body></html> }

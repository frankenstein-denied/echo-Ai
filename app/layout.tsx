import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { PwaRegister } from '@/components/echo/pwa'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Echo — Your life, remembered.',
  description: 'A calm AI diary companion for your goals, memories, and daily life.',
  applicationName: 'Echo',
  appleWebApp: { capable: true, title: 'Echo', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  other: { 'apple-mobile-web-app-capable': 'yes' },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/echo.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}
export const viewport: Viewport = { themeColor: '#0B0F14', width: 'device-width', initialScale: 1, viewportFit: 'cover' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={inter.variable}><body><AuthProvider>{children}<PwaRegister /></AuthProvider></body></html> }

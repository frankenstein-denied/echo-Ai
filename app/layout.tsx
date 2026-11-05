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
// The prerendered HTML is always the landing page. For a returning user or a floating Echo window, hide it before first
// paint so it never flashes; app/page.tsx clears the flag once React has picked the real screen. The timer is a safety net.
const BOOT_SCRIPT = `(function(){try{var d=document.documentElement;if(window.EchoFloat||localStorage.getItem('echo:signed-in')==='1'){d.setAttribute('data-boot','');setTimeout(function(){d.removeAttribute('data-boot')},5000)}}catch(e){}})()`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          {children}
          <PwaRegister />
        </AuthProvider>
      </body>
    </html>
  )
}

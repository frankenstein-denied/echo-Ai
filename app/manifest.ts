import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Echo — your diary that listens',
    short_name: 'Echo',
    description: 'A calm AI diary companion for your goals, memories, and daily life.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0B0F14',
    theme_color: '#0B0F14',
    categories: ['lifestyle', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

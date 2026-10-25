/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_DIST_DIR lets a production build run beside `next dev` (e.g. NEXT_DIST_DIR=.next-prod).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    const noStore = [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }]
    return [
      { source: '/sw.js', headers: noStore },
      { source: '/sw-routing.js', headers: noStore },
    ]
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig

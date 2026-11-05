import type { CapacitorConfig } from '@capacitor/cli'

// The Android app is a thin shell: it loads the live Vercel site, so web deploys
// reach the phone without a new APK. Only native (Kotlin) changes need a rebuild.
const config: CapacitorConfig = {
  appId: 'com.echo.app',
  appName: 'Echo',
  // Fallback bundle shown only if the remote URL cannot load at all.
  webDir: 'mobile-shell',
  server: {
    url: 'https://echo-ai-blue.vercel.app',
    androidScheme: 'https',
    // Show our own "can't connect / Retry" page instead of the raw WebView error.
    errorPath: 'index.html',
  },
  plugins: {
    FirebaseAuthentication: {
      // Native side only fetches the Google credential; the web Firebase SDK signs in with it.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
}

export default config

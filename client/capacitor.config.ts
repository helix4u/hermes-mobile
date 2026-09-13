import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.hermes.mobile',
  appName: 'Hermes Mobile',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    loggingBehavior: 'none',
  },
  plugins: { SystemBars: { insetsHandling: 'disable' } },
}

export default config

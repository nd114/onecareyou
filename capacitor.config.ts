import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.6c9a0f6e91c64bf59dc6f2b8b2fb3b00',
  appName: 'one-care',
  webDir: 'dist',
  server: {
    url: 'https://6c9a0f6e-91c6-4bf5-9dc6-f2b8b2fb3b00.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false
    },
    StatusBar: {
      style: 'default'
    }
  }
};

export default config;

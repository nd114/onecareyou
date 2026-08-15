import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.6c9a0f6e91c64bf59dc6f2b8b2fb3b00",
  appName: "OneCare",
  webDir: "dist",
  // No `server.url` here on purpose. Pointing a native build at the hosted
  // preview means the shipped app loads someone else's URL over the network
  // instead of the bundle in `dist` — it breaks offline support, ties store
  // builds to a preview environment, and needed cleartext traffic to work.
  // For live-reload during development, add `server` locally; never commit it.
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#F5F0E0",
      showSpinner: false,
    },
    StatusBar: {
      style: "default",
    },
  },
};

export default config;
